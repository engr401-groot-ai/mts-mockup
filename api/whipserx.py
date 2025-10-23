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
import shutil
import time
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
CHUNK_LENGTH_MS = 20 * 60 * 1000
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
        try:
            exists = blob.exists()
        except Exception as e:
            print(f"Warning: could not verify blob existence for {filepath}: {e}")
            exists = None

        gcs_path = f"gs://{BUCKET_NAME}/{filepath}"
        if exists is True:
            print(f"Uploaded to GCS: {gcs_path}")
        else:
            print(f"Uploaded (verification unavailable) to GCS: {gcs_path}")

        return gcs_path
    except Exception as e:
        print(f"ERROR uploading to GCS: {filepath} -> {e}", file=sys.stderr)
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
def cleanup_old_chunk_dirs(prefix='whisperx_chunks_', max_age_seconds=60):
    """Remove old temporary chunk directories left from previous runs.
    Only removes directories older than `max_age_seconds` to avoid interfering
    with currently running jobs.
    """
    tmp_root = tempfile.gettempdir()
    now = time.time()
    try:
        for name in os.listdir(tmp_root):
            if not name.startswith(prefix):
                continue
            path = os.path.join(tmp_root, name)
            try:
                mtime = os.path.getmtime(path)
            except Exception:
                mtime = now
            age = now - mtime
            if age > max_age_seconds and os.path.isdir(path):
                try:
                    shutil.rmtree(path)
                    print(f"Removed stale chunk dir: {path}")
                except Exception as e:
                    print(f"Failed to remove stale chunk dir {path}: {e}")
    except Exception as e:
        print(f"Error during stale chunk dir cleanup: {e}")

def split_audio(audio_path, chunk_length_ms=CHUNK_LENGTH_MS):
    # clean up any stale chunk dirs before creating a fresh one
    cleanup_old_chunk_dirs()
    temp_dir = tempfile.mkdtemp(prefix="whisperx_chunks_")
    print(f"Splitting audio into {chunk_length_ms/60000:.1f}-min chunks into {temp_dir}")

    try:
        result = subprocess.run([
            'ffprobe', '-v', 'error', '-show_entries', 
            'format=duration', '-of', 
            'default=noprint_wrappers=1:nokey=1', audio_path
        ], capture_output=True, text=True, check=True)
        
        total_duration = float(result.stdout.strip()) * 1000
    except Exception as e:
        # Clean up temp_dir on failure to avoid leaving junk behind
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                print(f"Cleaned up chunk temp dir after failure: {temp_dir}")
        except Exception:
            pass
        raise RuntimeError(f"ffprobe failed: {e}")

    num_chunks = math.ceil(total_duration / chunk_length_ms)
    print(f"Total duration: {total_duration/1000:.1f}s ({num_chunks} chunks expected)")

    # create chunks
    chunks = []
    for i in range(num_chunks):
        start_ms = i * chunk_length_ms
        end_ms = min(start_ms + chunk_length_ms, total_duration)
        out_path = os.path.join(temp_dir, f"chunk_{i:03d}.wav")

        subprocess_cmd = [
            'ffmpeg', '-y',
            '-i', audio_path,
            '-ss', str(start_ms / 1000),
            '-to', str(end_ms / 1000),
            '-acodec', 'copy',
            out_path
        ]

        try:
            subprocess.run(subprocess_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            chunks.append((out_path, start_ms / 1000, end_ms / 1000))
            print(f"   Chunk {i}: {start_ms/1000:.1f}s → {end_ms/1000:.1f}s")
        except Exception as e:
            print(f"   Error creating chunk {i}: {e}")
    
    print(f"Created {len(chunks)}/{num_chunks} chunks successfully.")
    # return both the chunk list and the temp directory so callers can clean up
    return chunks, temp_dir

# Helper function to transcribe audio chunks
def transcribe_audio_chunks(audio_path, offset_seconds=0):
    print(f"Transcribing audio chunk: {audio_path} (offset: {offset_seconds/60:.1f} min)...")

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
            })

        adjusted_segments.append(adjusted_segment)

    # Build full text from all segments
    full_text = " ".join(seg['text'] for seg in adjusted_segments if seg.get('text')).strip()

    print(f"Chunk {audio_path} processed, segments: {len(adjusted_segments)}")
    return adjusted_segments, full_text

# Helper function to transcribe full audio file using parallel processing
def transcribe_full_audio_parallel(audio_path):
    chunks, temp_dir = split_audio(audio_path)
    all_segments = []

    total_chunks = len(chunks)
    completed_chunks = 0
    
    print(f"Starting parallel transcription for {total_chunks} chunks")

    max_workers = min(4, os.cpu_count() or 1)
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(transcribe_audio_chunks, c[0], c[1]): c for c in chunks}
            
            for future in as_completed(futures):
                chunk_path, _, _ = futures[future]
                try:
                    segments, text = future.result()
                    all_segments.extend(segments)
                except Exception as e:
                    print(f"Failed processing chunk {futures[future]}: {e}")
                finally:
                    try:
                        if os.path.exists(chunk_path):
                            os.remove(chunk_path)
                            print(f"Removed temporary chunk file: {chunk_path}")
                    except Exception:
                        print(f"Failed to remove temporary chunk file: {chunk_path}")
                        pass

                completed_chunks += 1
                print(f"[Progress] {completed_chunks}/{total_chunks} chunks completed")
    finally:
        # Ensure the chunk directory is removed after processing
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                print(f"Removed temporary chunk directory: {temp_dir}")
        except Exception as e:
            print(f"Failed to remove temporary chunk directory {temp_dir}: {e}")

        # also try to remove any other stale chunk dirs promptly
        cleanup_old_chunk_dirs()

    sorted_segments = sorted(all_segments, key=lambda s: s.get('start', 0))
    for idx, segment in enumerate(sorted_segments):
        segment['id'] = idx

    full_text = " ".join(segment.get('text', '').strip() for segment in sorted_segments if segment.get('text'))
    full_text = re.sub(r'\s+', ' ', full_text).strip()

    print(f"Full transcription completed, total segments: {len(sorted_segments)}")
    return sorted_segments, full_text

# Helper function to run a transcription job
def run_transcription_job(job_id, youtube_url, year, committee_list, bill_name, video_title, hearing_date, room, ampm, bill_ids):
    temp_dir = tempfile.mkdtemp()
    try:
        audio_path, duration, title = download_youtube_audio(youtube_url, temp_dir)

        start_time = datetime.now()
        segments, full_text = transcribe_full_audio_parallel(audio_path)
        processing_time = (datetime.now() - start_time).total_seconds()
        committee_slug = '-'.join([sanitize_path(c).replace(' ', '').upper() for c in committee_list]) if committee_list else 'UNKNOWN'
        hearing_id = f"{year}_{committee_slug}_{bill_name}_{video_title}"
        folder_path = f"{year}/{committee_slug}/{bill_name}/{video_title}".replace(' ', '_')

        metadata = {
            'hearing_id': hearing_id,
            'title': title,
            'date': hearing_date,
            'duration': duration,
            'youtube_url': youtube_url,
            'year': year,
            'committee': committee_list,
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

        metadata_gcs = upload_to_gcs(metadata, f"{folder_path}/metadata.json")
        transcript_gcs = upload_to_gcs(transcript, f"{folder_path}/transcript.json")

        print(f"run_transcription_job: metadata_gcs={metadata_gcs}, transcript_gcs={transcript_gcs}")

        return metadata, transcript, folder_path
    except Exception as e:
        raise e
    finally:
        # Clean up download temp dir
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                print(f"Cleaned up download temp dir: {temp_dir}")
        except Exception as e:
            print(f"Failed to remove download temp dir {temp_dir}: {e}")

        # also try to remove any other stale chunk dirs promptly
        cleanup_old_chunk_dirs()


# Helper function to handle background transcription jobs
jobs = {}
jobs_lock = threading.Lock()
def background_transcribe(job_id, youtube_url, year, committee_list, bill_name, video_title, hearing_date, room, ampm, bill_ids):
    try:
        with jobs_lock:
            jobs[job_id] = {'status': 'processing', 'progress': '0/0 chunks completed'}

        metadata, transcript, folder_path = run_transcription_job(
            job_id, youtube_url, year, committee_list, bill_name, video_title, hearing_date, room, ampm, bill_ids
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
    raw_committee = data.get('committee', '')
    if isinstance(raw_committee, list):
        committee_list = [sanitize_path(c) for c in raw_committee if c]
    else:
        committee_list = [sanitize_path(raw_committee)] if raw_committee else []
    bill_name = sanitize_path(data.get('bill_name', ''))
    video_title = sanitize_path(data.get('video_title', ''))
    hearing_date = data.get('hearing_date', datetime.now().strftime('%Y-%m-%d'))
    room = sanitize_path(data.get('room', ''))
    ampm = sanitize_path(data.get('ampm', ''))
    bill_ids = data.get('bill_ids', [])

    # validate all fields
    if not all([youtube_url, year, committee_list, bill_name, video_title, hearing_date]):
        return jsonify({
            'error': 'Missing required fields',
            'required': ['youtube_url', 'year', 'committee', 'bill_name', 'video_title', 'hearing_date']
        }), 400
    
    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {'status': 'queued'}

    def run_in_background():
        background_transcribe(
            job_id, youtube_url, year, committee_list, bill_name,
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
                    try:
                        metadata = json.loads(blob.download_as_text())
                        transcripts.append(metadata)
                    except Exception as e:
                        print(f"Warning: failed to read metadata blob {blob.name}: {e}", file=sys.stderr)

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