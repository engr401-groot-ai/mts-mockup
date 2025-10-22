import os
import re
import sys
import math
import uuid
import json
import subprocess
import threading
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import whisperx
import yt_dlp
from google.cloud import storage

'''
TODO:
- Rate Limiting
- Locks
- Request timeout handling
- Proper logging
- File size and duration checks
- Job queue management
'''

# Configurations (can be adjusted as needed)
MAX_VIDEO_DURATION_SECONDS = 10800
MAX_AUDIO_FILE_SIZE_MB = 500
CHUNK_LENGTH_MS = 10 * 60 * 1000
MODEL_NAME = os.getenv('WHISPER_MODEL_NAME', 'large-v3')
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize google cloud storage
storage_client = storage.Client()
BUCKET_NAME = os.getenv('GCS_BUCKET', 'hearing_videos')

# Load Open AI WhisperX Model
print("Loading WhisperX model...")
if DEVICE == "cuda":
    model = whisperx.load_model(MODEL_NAME, device=DEVICE, compute_type="float16")
else:
    model = whisperx.load_model(MODEL_NAME, device=DEVICE, compute_type="int8" )
alignment_model, metadata = whisperx.load_align_model(language_code='en', device=DEVICE)
print(f"WhisperX model '{MODEL_NAME}' loaded on {DEVICE}.")

# Context manager for temporary directories
@contextmanager
def managed_temp_dir():
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir

# Helper function to sanitize path components
def sanitize_path(component):
    if not component:
        return ''
    component = str(component).strip()
    component = component.replace('..', '').replace('/', '').replace('\\', '')
    component = re.sub(r'[^\w\s\-]', '_', component)
    return component

# Helper function to upload json to GCS
def upload_to_gcs(content, filepath):
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filepath)
        blob.upload_from_string(
            json.dumps(content, ensure_ascii=False, indent=2),
            content_type='application/json'
        )
        return f"gs://{BUCKET_NAME}/{filepath}"
    except Exception as e:
        raise RuntimeError(f"Failed to upload {filepath} to GCS: {str(e)}")

# Helper function to get json from GCS
def get_from_gcs(filepath):
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filepath)

        if blob.exists():
            return json.loads(blob.download_as_text())
        return None
    except Exception as e:
        print(f"Error fetching from GCS: {str(e)}", file=sys.stderr)
        return None

# Helper function to download _u video from url and get audio
def download_youtube_audio(youtube_url, temp_dir):
    output_path = os.path.join(temp_dir, "audio")
    print(f"Downloading audio from {youtube_url}")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_path + '.%(ext)s',
        'noplaylist': True,
        'quiet': False,
        'no_warnings': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) '
                      'Chrome/120.0.0.0 Safari/537.36',
        },
    }

    # download the audio using yt_dlp
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        duration = info.get('duration', 0)
        title = info.get('title', 'unknown_title')

    wav_file = output_path + ".wav"

    print(f"Downloaded: {title}")
    print(f"Audio size: {os.path.getsize(wav_file) / (1024 * 1024):.2f} MB")
    print(f"Duration: {duration // 60} minutes {duration % 60} seconds")

    return wav_file, duration, title

# Helper function to split audio into chunks
def split_audio(audio_path, chunk_length_ms=CHUNK_LENGTH_MS):
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'error', '-show_entries', 
            'format=duration', '-of', 
            'default=noprint_wrappers=1:nokey=1', audio_path
        ], capture_output=True, text=True, check=True)
        
        total_duration_seconds = float(result.stdout.strip())
    except Exception as e:
        print(f"Error getting audio duration: {str(e)}")
        return [(audio_path, 0, 0)]
    
    # check if chunking is needed
    total_duration_ms = int(total_duration_seconds * 1000)
    if total_duration_ms <= chunk_length_ms:
        return [(audio_path, 0, total_duration_ms)]

    num_chunks = math.ceil(total_duration_seconds * 1000 / chunk_length_ms)
    chunk_length_seconds = chunk_length_ms / 1000

    chunks_info = []
    temp_dir = os.path.dirname(audio_path)

    # create chunks
    for i in range(num_chunks):
        start_seconds = i * chunk_length_seconds
        end_seconds = min((i + 1) * chunk_length_seconds, total_duration_seconds)
        chunk_duration = end_seconds - start_seconds

        # skip chunks shorter than 1 seconds
        if chunk_duration < 1:
            continue

        # create temporary chunk file path
        chunk_path = os.path.join(temp_dir, f"chunk_{i}.wav")

        try:
            # use ffmpeg to create chunk
            subprocess.run([
                'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
                '-i', audio_path,
                '-ss', str(start_seconds),
                '-t', str(chunk_duration),
                '-ac', '1',
                '-ar', '16000',
                '-acodec', 'pcm_s16le',
                chunk_path
            ], check=True)

            chunks_info.append((chunk_path, int(start_seconds*1000), int(end_seconds*1000)))
        except subprocess.CalledProcessError as e:
            print(f"Error creating chunk {i}: {str(e)} – returning original audio")
            continue

    if not chunks_info:
        chunks_info = [(audio_path, 0, int(total_duration_seconds*1000))]

    return chunks_info

# Helper function to transcribe audio chunks
def transcribe_audio_chunks(audio_path, offset_ms=0):
    print(f"Transcribing audio chunk: {audio_path} (offset: {offset_ms/1000/60:.1f} min)...")

    try:
        # run transcription
        result = model.transcribe(
            audio_path,
            language='en',
            verbose=False,
            batch_size=16,
        )
        print(f"Transcription completed for chunk: {audio_path}")
    except Exception as e:
        print(f"Error transcribing chunk {audio_path}: {e}")
        return [], ""

    try:
        # run alignment
        result_aligned = whisperx.align(
            result["segments"],
            alignment_model,
            metadata,
            audio_path,
            DEVICE
        )
        print(f"Alignment completed for chunk: {audio_path}")
    except Exception as e:
        print(f"Error aligning chunk {audio_path}: {e}")
        return [], ""

    # adjust timestamps w/ offset
    offset_seconds = offset_ms / 1000.0
    adjusted_segments = []

    # for each segment, adjust it and append words
    for idx, segment in enumerate(result_aligned.get('segments', [])):
        adjusted_segment = {
            'id': segment.get('id', idx),
            'start': segment.get('start', 0) + offset_seconds,
            'end': segment.get('end', 0) + offset_seconds,
            'text': segment.get('text', '').strip(),
            'words': []
        }
        for word in segment.get('words', []):
            adjusted_segment['words'].append({
                'word': word.get('word', ''),
                'start': word.get('start', 0) + offset_seconds,
                'end': word.get('end', 0) + offset_seconds,
                'probability': word.get('probability')
            })

        adjusted_segments.append(adjusted_segment)

    # Build full text from all segments
    full_text = " ".join(seg['text'] for seg in adjusted_segments if seg.get('text')).strip()

    print(f"Chunk {audio_path} processed, segments: {len(adjusted_segments)}")
    return adjusted_segments, full_text

# Helper function to transcribe full audio file using parallel processing
def transcribe_full_audio_parallel(audio_path):
    chunks = split_audio(audio_path)
    all_segments = []
    all_text_parts = []

    total_chunks = len(chunks)
    completed_chunks = 0
    
    print(f"Starting parallel transcription for {total_chunks} chunks")

    max_workers = min(4, os.cpu_count() or 1)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(transcribe_audio_chunks, c[0], c[1]): c for c in chunks}
        for future in as_completed(futures):
            chunk_path, _, _ = futures[future]
            try:
                segments, text = future.result()
                all_segments.extend(segments)
                all_text_parts.append(text)
            except Exception as e:
                print(f"Failed processing chunk {futures[future]}: {e}")
            finally:
                try:
                    os.remove(chunk_path)
                    print(f"Removed temporary chunk file: {chunk_path}")
                except Exception:
                    print(f"Failed to remove temporary chunk file: {chunk_path}")
                    pass

            completed_chunks += 1
            print(f"[Progress] {completed_chunks}/{total_chunks} chunks completed")

    full_text = " ".join(part.strip() for part in all_text_parts if part)
    full_text = re.sub(r'\s+', ' ', full_text)

    print(f"Full transcription completed, total segments: {len(all_segments)}")
    return all_segments, full_text

# Helper function to run a transcription job
def run_transcription_job(job_id, youtube_url, year, committee, bill_name, video_title, hearing_date, room, ampm, bill_ids):
        temp_dir = tempfile.mkdtemp()
        try:
            audio_path, duration, title = download_youtube_audio(youtube_url, temp_dir)

            start_time = datetime.now()
            segments, full_text = transcribe_full_audio_parallel(audio_path)
            processing_time = (datetime.now() - start_time).total_seconds()

            hearing_id = f"{year}_{committee}_{bill_name}_{video_title}"
            folder_path = f"{year}/{committee}/{bill_name}/{video_title}".replace(' ', '_')

            metadata = {
                'hearing_id': hearing_id,
                'title': title,
                'date': hearing_date,
                'duration': duration,
                'youtube_url': youtube_url,
                'year': year,
                'committee': committee,
                'bill_name': bill_name,
                'bill_ids': bill_ids,
                'video_title': video_title,
                'room': room,
                'ampm': ampm,
                'folder_path': folder_path,
                'created_at': datetime.now().isoformat(),
            }

            transcript = {
                'hearing_id': hearing_id,
                'text': full_text,
                'language': 'en',
                'duration': duration,
                'processing_time': processing_time,
                'model': MODEL_NAME,
                'segments': segments if segments else [],
                'total_segments': len(segments),
                'created_at': datetime.now().isoformat(),
            }

            upload_to_gcs(metadata, f"{folder_path}/metadata.json")
            upload_to_gcs(transcript, f"{folder_path}/transcript.json")

            return metadata, transcript, folder_path
        except Exception as e:
            raise e
        finally:
            for f in Path(temp_dir).glob("*"):
                try:
                    f.unlink()
                except Exception:
                    pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass


# Helper function to handle background transcription jobs
jobs = {}
jobs_lock = threading.Lock()
def background_transcribe(job_id, youtube_url, year, committee, bill_name, video_title, hearing_date, room, ampm, bill_ids):
    try:
        with jobs_lock:
            jobs[job_id] = {'status': 'processing', 'progress': '0/0 chunks completed'}

        metadata, transcript, folder_path = run_transcription_job(
            job_id, youtube_url, year, committee, bill_name, video_title, hearing_date, room, ampm, bill_ids
        )

        with jobs_lock:
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['progress'] = '100%'
            jobs[job_id]['result'] = {
                'metadata': metadata,
                'transcript': transcript,
                'folder_path': folder_path
            }

    except Exception as e:
        with jobs_lock:
            jobs[job_id]['status'] = 'failed'
            jobs[job_id]['error'] = str(e)
    
# Flask route to check API health
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model': MODEL_NAME,
        'gcs_bucket': BUCKET_NAME,
        'chunk_length_minutes': CHUNK_LENGTH_MS / 1000 / 60,
    })

# Flask route to handle POST transcribe requests
@app.route('/transcribe', methods=['POST'])
def transcribe():
    data = request.json
    youtube_url = data.get('youtube_url')
    year = sanitize_path(data.get('year', ''))
    committee = sanitize_path(data.get('committee', ''))
    bill_name = sanitize_path(data.get('bill_name', ''))
    video_title = sanitize_path(data.get('video_title', ''))
    hearing_date = data.get('hearing_date', datetime.now().strftime('%Y-%m-%d'))
    room = sanitize_path(data.get('room', ''))
    ampm = sanitize_path(data.get('ampm', ''))
    bill_ids = data.get('bill_ids', [])

    # validate all fields
    if not all([youtube_url, year, committee, bill_name, video_title, hearing_date]):
        return jsonify({
            'error': 'Missing required fields',
            'required': ['youtube_url', 'year', 'committee', 'bill_name', 'video_title', 'hearing_date']
        }), 400
    
    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {'status': 'queued'}

    def run_in_background():
        background_transcribe(
            job_id, youtube_url, year, committee, bill_name,
            video_title, hearing_date, room, ampm, bill_ids
        )

    threading.Thread(target=run_in_background, daemon=True).start()

    return jsonify({
        'job_id': job_id,
        'status': 'queued',
        'message': 'Transcription started in background'
    })

# Flask route to handle GET specific transcript request
@app.route('/transcript/<path:folder_path>', methods=['GET'])
def get_transcript(folder_path):
    try:
        if '..' in folder_path:
            return jsonify({'error': 'Invalid path'}), 400
        
        metadata_path = f"{folder_path}/metadata.json"
        transcript_path = f"{folder_path}/transcript.json"

        metadata = get_from_gcs(metadata_path)
        transcript = get_from_gcs(transcript_path)

        if not metadata or not transcript:
            return jsonify({'error': 'Transcript not found'}), 404

        return jsonify({
            'metadata': metadata,
            'transcript': transcript,
            'folder_path': f"gs://{BUCKET_NAME}/{folder_path}",
        })
    
    except Exception as e:
        return jsonify({
            'error': 'Failed to fetch transcript',
            'details': str(e)
        }), 500

# Flask route to handle GET list of transcripts request
@app.route('/list-transcripts', methods=['GET'])
def list_transcripts():
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blobs = bucket.list_blobs(max_results=1000)

        transcripts = []
        seen_folders = set()
        
        for blob in blobs:
            if blob.name.endswith('metadata.json'):
                folder_path = blob.name.replace('/metadata.json', '')
                
                if folder_path not in seen_folders:
                    seen_folders.add(folder_path)
                    metadata = json.loads(blob.download_as_text())
                    transcripts.append(metadata)

        return jsonify({
            'transcripts': sorted(transcripts, key=lambda x: x.get('date', ''), reverse=True),
            'count': len(transcripts)
        })
    
    except Exception as e:
        return jsonify({
            'error': 'Failed to list transcripts',
            'details': str(e)
        }), 500

# Flask route to check job status
@app.route('/job_status/<job_id>', methods=['GET'])
def job_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


# Run the Flask app
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"\n{'='*60}")
    print(f"Starting Transcription API on port {port}")
    print(f"Model: {MODEL_NAME}")
    print(f"GCS Bucket: {BUCKET_NAME}")
    print(f"Chunk Length: {CHUNK_LENGTH_MS / 1000 / 60} minutes")
    print(f"{'='*60}\n")
    
    app.run(host='0.0.0.0', port=port, debug=True)