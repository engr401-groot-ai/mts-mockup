from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import os
import json
from google.cloud import storage
from datetime import datetime
import tempfile
import yt_dlp
import sys
import subprocess
import shutil
from pathlib import Path
import re

'''
TODO:
- Rate Limting
- CORS restrictions
- Locks
- Request timeout handling
- Proper logging
- File size and duration checks
'''

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize google cloud storage
storage_client = storage.Client()
BUCKET_NAME = os.getenv('GCS_BUCKET', 'hearing_videos')

# Load Open AI Whisper Model
print("Loading Whisper model...")
MODEL_NAME = os.getenv('WHISPER_MODEL_NAME', 'large-v3-turbo')
model = whisper.load_model(MODEL_NAME)
print(f"Model '{MODEL_NAME}' loaded successfully.")

# Configurations (can be adjusted as needed)
MAX_VIDEO_DURATION_SECONDS = 10800
MAX_AUDIO_FILE_SIZE_MB = 500
CHUNK_LENGTH_MS = 10 * 60 * 1000

# Helper function to sanitize path components
def sanitize_path(component):
    if not component:
        return ''
    component = str(component).strip()
    component = component.replace('..', '').replace('/', '').replace('\\', '')
    component = re.sub(r'[^\w\s\-]', '_', component)
    return component

# Helper function to download youtube video from url and get audio
def download_youtube_audio(youtube_url):
    # create a temporary directory to store the downloaded file
    temp_dir = tempfile.mkdtemp()
    output_path = os.path.join(temp_dir, "audio")

    print(f"Downloading audio from {youtube_url}")

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': True,
    }

    try:
        # download the audio using youtube-dl
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            duration = info.get('duration', 0)
            title = info.get('title', 'unknown_title')

        audio_file = output_path + ".mp3"
        print(f"Downloaded: {title}")
        print(f"Duration: {duration // 60} minutes {duration % 60} seconds")

        return audio_file, temp_dir, duration, title
    except Exception as e:
        print(f"Error downloading Youtube audio: {str(e)}")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise

# helper function to split audio into chunks
def split_audio(audio_path, chunk_length_ms=CHUNK_LENGTH_MS):
    try:
        # get audio duration using ffprobe
        result = subprocess.run([
            'ffprobe', '-v', 'error', '-show_entries', 
            'format=duration', '-of', 
            'default=noprint_wrappers=1:nokey=1', audio_path
        ], capture_output=True, text=True, check=True)
        
        total_duration_seconds = float(result.stdout.strip())
        total_duration_ms = int(total_duration_seconds * 1000)
        total_duration_min = total_duration_ms / 1000 / 60
        
        print(f"Total audio duration: {total_duration_min:.2f} minutes")
    except Exception as e:
        # fallback: no chunking needed
        print(f"Error getting audio duration: {str(e)}")
        return [(audio_path, 0, 0)] 
    
    # check if chunking is needed
    if total_duration_ms <= chunk_length_ms:
        print("No chunking needed.")
        return [(audio_path, 0, total_duration_ms)]
    
    # calculate number of chunks
    chunk_length_seconds = chunk_length_ms / 1000
    num_chunks = int((total_duration_seconds / chunk_length_seconds) + 0.5)
    print(f"Splitting audio into {num_chunks} chunks of {chunk_length_ms / 1000 / 60} minutes each...")

    chunks_info = []
    temp_dir = os.path.dirname(audio_path)

    # create chunks
    for i in range(num_chunks):
        start_seconds = i * chunk_length_seconds
        start_ms = int(start_seconds * 1000)

        end_seconds = min((i + 1) * chunk_length_seconds, total_duration_seconds)
        end_ms = int(end_seconds * 1000)

        chunk_duration = end_seconds - start_seconds

        # create temporary chunk file path
        chunk_path = os.path.join(temp_dir, f"chunk_{i}.mp3")

        try:
            # use ffmpeg to create chunk
            subprocess.run([
                'ffmpeg', '-y', '-i', audio_path,
                '-ss', str(start_seconds),
                '-t', str(chunk_duration),
                '-acodec', 'libmp3lame',
                '-q:a', '2',
                chunk_path
            ], check=True, capture_output=True)
            
            chunks_info.append((chunk_path, start_ms, end_ms))
            print(f"Chunk {i+1}/{num_chunks} created: {chunk_path} ({start_ms/1000/60:.1f} - {end_ms/1000/60:.1f} min)")
        except subprocess.CalledProcessError as e:
            # fallback: return original audio if chunking fails
            print(f"Error creating chunk {i}: {str(e)}")
            return [(audio_path, 0, total_duration_ms)]
        
    return chunks_info

# Helper function to transcribe audio chunks
def transcribe_audio_chunks(audio_path, offset_ms=0):
    print(f"Transcribing audio chunk: {audio_path} (offset: {offset_ms/1000/60:.1f} min)...")

    # transcribe using whisper
    result = model.transcribe(
        audio_path,
        language='en',
        word_timestamps=True,
        verbose=False,
        condition_on_previous_text=True,
    )

    offset_seconds = offset_ms / 1000

    # adjust segment timestamps
    adjusted_segments = []
    for segment in result['segments']:
        adjusted_segment = {
            'id': segment['id'],
            'start': segment['start'] + offset_seconds,
            'end': segment['end'] + offset_seconds,
            'text': segment['text'],
            'words': []
        }

        if 'words' in segment:
            for word in segment['words']:
                adjusted_segment['words'].append({
                    'word': word.get('word', ''),
                    'start': word.get('start', 0) + offset_seconds,
                    'end': word.get('end', 0) + offset_seconds,
                    'probability': word.get('probability', 0)
                })
        
        adjusted_segments.append(adjusted_segment)
    
    return adjusted_segments, result.get('text', '')

# Helper function to transcribe full audio file
def transcribe_full_audio(audio_path, progress_callback=None):
    chunks = split_audio(audio_path)
    all_segments = []
    all_text_parts = []
    total_chunks = len(chunks)

    # process each chunk
    for index, (chunk_path, start_ms, end_ms) in enumerate(chunks):
        if progress_callback:
            progress_callback(f"{index + 1}/{total_chunks}...")
        
        print(f"\nProcessing chunk {index + 1}/{total_chunks}...")

        segments, text = transcribe_audio_chunks(chunk_path, offset_ms=start_ms)

        for segment in segments:
            segment['id'] = len(all_segments)
            all_segments.append(segment)
        
        all_text_parts.append(text)

        if chunk_path != audio_path:
            try:
                os.remove(chunk_path)
                print(f"Cleaned up chunk: {chunk_path}")
            except Exception as e:
                print(f"Warning: could not remove chunk {chunk_path}: {e}")
    
    full_text = ' '.join(all_text_parts)

    return all_segments, full_text

# Helper function to upload json to GCS
def upload_to_gcs(content, filepath):
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filepath)

    blob.upload_from_string(
        json.dumps(content, ensure_ascii=False, indent=2),
        content_type='application/json'
    )
    
    return f"gs://{BUCKET_NAME}/{filepath}"

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
    year = data.get('year')
    committee = data.get('committee')
    bill_name = data.get('bill_name')
    bill_ids = data.get('bill_ids', [])
    video_title = data.get('video_title')
    hearing_date = data.get('hearing_date', datetime.now().strftime('%Y-%m-%d'))
    room = data.get('room', '')
    ampm = data.get('ampm', '')

    # validate all fields
    if not all([youtube_url, year, committee, bill_name, video_title, hearing_date]):
        return jsonify({
            'error': 'Missing required fields',
            'required': ['youtube_url', 'year', 'committee', 'bill_name', 'video_title', 'hearing_date']
        }), 400
    
    year = sanitize_path(year)
    committee = sanitize_path(committee)
    bill_name = sanitize_path(bill_name)
    video_title = sanitize_path(video_title)
    room = sanitize_path(room) if room else ''
    ampm = sanitize_path(ampm) if ampm else ''
    
    temp_dir = None
    audio_path = None
    
    try:
        # build GCS folder path: hearing-videos/YEAR/COMMITTEE/BILL_NAME/VIDEO_TITLE/
        folder_path = f"{year}/{committee}/{bill_name}/{video_title}"
        metadata_path = f"{folder_path}/metadata.json"
        transcript_path = f"{folder_path}/transcript.json"

        # check if transcript already exists, return cached if true
        existing_metadata = get_from_gcs(metadata_path)
        existing_transcript = get_from_gcs(transcript_path)
        if existing_metadata and existing_transcript:
            print(f"Returning cached transcript for {folder_path}")
            return jsonify({
                'metadata': existing_metadata,
                'transcript': existing_transcript,
                'folder_path': f"gs://{BUCKET_NAME}/{folder_path}",
                'cached': True
            })
        
        # log transcription
        print(f"\n{'='*60}")
        print(f"Starting transcription for: {folder_path}")
        print(f"Year: {year} | Committee: {committee} | Bill: {bill_name}")
        print(f"Video: {video_title}")
        print(f"{'='*60}\n")

        audio_path, temp_dir, duration, title = download_youtube_audio(youtube_url)

        print(f"\nStarting transcription process...")
        start_time = datetime.now()

        segments, full_text = transcribe_full_audio(audio_path)

        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        print(f"\n{'='*60}")
        print(f"Transcription completed!")
        print(f"Processing time: {processing_time / 60:.2f} minutes")
        print(f"Total segments: {len(segments)}")
        print(f"Text length: {len(full_text)} characters")
        print(f"{'='*60}\n")

        # generate meta data and transcript json
        hearing_id = f"{year}_{committee}_{bill_name}_{video_title}"

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
            'segments': segments,
            'total_segments': len(segments),
            'created_at': datetime.now().isoformat(),
        }

        # upload metadata and transcript to GCS
        print(f"Uploading metadata to GCS: {metadata_path}...")
        metadata_gcs_path = upload_to_gcs(metadata, metadata_path)

        print(f"Uploading transcript to GCS: {transcript_path}...")
        transcript_gcs_path = upload_to_gcs(transcript, transcript_path)

        print(f"Files uploaded successfully!\n")

        return jsonify({
            'metadata': metadata,
            'transcript': transcript,
            'folder_path': f"gs://{BUCKET_NAME}/{folder_path}",
            'metadata_path': metadata_gcs_path,
            'transcript_path': transcript_gcs_path,
            'cached': False,
            'stats': {
                'duration_minutes': duration / 60,
                'processing_time_minutes': processing_time / 60,
                'segments': len(segments),
                'model': MODEL_NAME
            }
        })
    except Exception as e:
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"ERROR: {str(e)}", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'error': 'Transcription failed',
            'details': str(e)
        }), 500
    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"Cleaned up audio file: {audio_path}")
            except Exception as e:
                print(f"Warning: could not remove audio file: {e}")
        
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print(f"Cleaned up temp directory: {temp_dir}")
            except Exception as e:
                print(f"Warning: could not remove temp directory: {e}")

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