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

app = Flask(__name__)
CORS(app)

# initialize google cloud storage
storage_client = storage.Client()
BUCKET_NAME = os.getenv('GCS_BUCKET', 'bucket-name')

# load whisper model
print("Loading Whisper model...")
MODEL_NAME = os.getenv('WHISPER_MODEL_NAME', 'large-v3-turbo')
model = whisper.load_model(MODEL_NAME)
print(f"Model '{MODEL_NAME}' loaded successfully.") 

# configurations
CHUNK_LENGTH_MS = 10 * 60 * 1000    # 10 minutes in milliseconds
MAX_CHUNK_SIZE_MB = 25              # 25MB

# 
def download_youtube_audio(youtube_url):
    temp_dir = tempfile.mkdtemp()
    output_path = os.path.join(temp_dir, "audio")

    print("Downloading audio from YouTube...")

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
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            duration = info.get('duration', 0)
            title = info.get('title', 'unknown_title')
        
        audio_file = output_path + '.mp3'
        print(f"Downloaded: {title}")
        print(f"Duration: {duration // 60} minutes {duration % 60} seconds")
        
        return audio_file, temp_dir, duration, title
    except Exception as e:
        print(f"Error downloading Youtube audio: {str(e)}")
        raise

# split audio into chunks using ffmpeg
def split_audio(audio_path, chunk_length_ms=CHUNK_LENGTH_MS):
    """
    Split audio into chunks using ffmpeg (no pydub dependency needed)
    Returns list of (chunk_path, start_ms, end_ms) tuples
    """
    print(f"Analyzing audio file: {audio_path}...")
    
    # Get audio duration using ffprobe
    try:
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
        print(f"Error getting audio duration: {e}")
        # Fallback: assume no chunking needed
        return [(audio_path, 0, 0)]
    
    # Check if chunking is needed
    if total_duration_ms <= chunk_length_ms:
        print("Audio is shorter than chunk length. No chunking needed.")
        return [(audio_path, 0, total_duration_ms)]
    
    # Calculate number of chunks
    chunk_length_seconds = chunk_length_ms / 1000
    num_chunks = int((total_duration_seconds / chunk_length_seconds) + 0.5)
    print(f"Splitting audio into {num_chunks} chunks of {chunk_length_ms / 1000 / 60} minutes each...")
    
    chunks_info = []
    temp_dir = os.path.dirname(audio_path)
    
    for i in range(num_chunks):
        start_seconds = i * chunk_length_seconds
        start_ms = int(start_seconds * 1000)
        
        # Calculate end time for this chunk
        end_seconds = min((i + 1) * chunk_length_seconds, total_duration_seconds)
        end_ms = int(end_seconds * 1000)
        
        # Duration of this specific chunk
        chunk_duration = end_seconds - start_seconds
        
        chunk_path = os.path.join(temp_dir, f"chunk_{i}.mp3")
        
        # Use ffmpeg to extract chunk
        try:
            subprocess.run([
                'ffmpeg', '-y', '-i', audio_path,
                '-ss', str(start_seconds),
                '-t', str(chunk_duration),
                '-acodec', 'libmp3lame',
                '-q:a', '2',  # Good quality
                chunk_path
            ], check=True, capture_output=True)
            
            chunks_info.append((chunk_path, start_ms, end_ms))
            print(f"Chunk {i+1}/{num_chunks} created: {chunk_path} ({start_ms/1000/60:.1f} - {end_ms/1000/60:.1f} min)")
            
        except subprocess.CalledProcessError as e:
            print(f"Error creating chunk {i}: {e}")
            # If chunking fails, return full audio
            return [(audio_path, 0, total_duration_ms)]
    
    return chunks_info

def transcribe_audio_chunks(audio_path, offset_ms=0):
    print(f"Transcribing audio chunk: (offset: {offset_ms/1000/60:.1f} min)...")

    result = model.transcribe(
        audio_path,
        language='en',
        word_timestamps=True,
        verbose=False,
        condition_on_previous_text=True,
    )

    offset_seconds = offset_ms / 1000

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

def transcribe_full_audio(audio_path, progress_callback=None):
    chunks = split_audio(audio_path)

    all_segments = []
    all_text_parts = []
    total_chunks = len(chunks)

    for index, (chunk_path, start_ms, end_ms) in enumerate(chunks):
        if progress_callback:
            progress_callback(f"{index + 1}/{total_chunks}")
        
        print(f"\nProcessing chunk {index + 1}/{total_chunks}...")

        segments, text = transcribe_audio_chunks(chunk_path, offset_ms=start_ms)

        for segment in segments:
            segment['id'] = len(all_segments)
            all_segments.append(segment)
        
        all_text_parts.append(text)

        if chunk_path != audio_path:
            try:
                os.remove(chunk_path)
            except:
                pass
        
    full_text = ' '.join(all_text_parts)

    return all_segments, full_text

def upload_to_gcs(content, filename):
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)

    blob.upload_from_string(
        json.dumps(content, ensure_ascii=False, indent=2),
        content_type='application/json'
    )

    return f"gs://{BUCKET_NAME}/{filename}"

def get_from_gcs(filename):
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)

        if blob.exists():
            return json.loads(blob.download_as_text())
        return None
    except Exception as e:
        print(f"Error fetching from GCS: {str(e)}", file=sys.stderr)
        return None
    
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model': MODEL_NAME,
        'gcs_bucket': BUCKET_NAME,
        'chunk_length_minutes': CHUNK_LENGTH_MS / 1000 / 60,
    })

@app.route('/transcribe', methods=['POST'])
def transcribe():
    data = request.json
    youtube_url = data.get('youtube_url')
    hearing_id = data.get('hearing_id', f"transcript-{int(datetime.now().timestamp())}")

    if not youtube_url:
        return jsonify({'error': 'youtube_url is required'}), 400

    try:
        gcs_filename = f"transcripts/{hearing_id}.json"
        existing = get_from_gcs(gcs_filename)

        if existing:
            print(f"Returning cached transcript for {hearing_id}")
            return jsonify({
                'transcript': existing,
                'gcs_path': f"gs://{BUCKET_NAME}/{gcs_filename}",
                'cached': True
            })

        print(f"\n{'='*60}")
        print(f"Starting transcription for hearing_id: {hearing_id}")
        print(f"Hearing ID: {hearing_id}")
        print(f"\n{'='*60}")

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
        print(f"\n{'='*60}")

        transcript_data = {
            'id': hearing_id,
            'youtube_url': youtube_url,
            'title': title,
            'text': full_text,
            'language': 'en',
            'duration': duration,
            'processing_time': processing_time,
            'model': MODEL_NAME,
            'segments': segments,
            'created_at': datetime.now().isoformat(),
            'total_segments': len(segments),
        }

        import shutil
        try:
            os.remove(audio_path)
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"Warning: could not clean up temp files: {str(e)}")
        
        print(f"Saving transcript to GCS...")
        gcs_path = upload_to_gcs(transcript_data, gcs_filename)
        print(f"Transcript saved to {gcs_path}")

        return jsonify({
            'transcript': transcript_data,
            'gcs_path': gcs_path,
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
    
@app.route('/transcript/<hearing_id>', methods=['GET'])
def get_transcript(hearing_id):
    try:
        gcs_filename = f"transcripts/{hearing_id}.json"
        transcript = get_from_gcs(gcs_filename)

        if not transcript:
            return jsonify({'error': 'Transcript not found'}), 404

        return jsonify({
            'transcript': transcript,
            'gcs_path': f"gs://{BUCKET_NAME}/{gcs_filename}",
            'cached': True
        })
    
    except Exception as e:
        return jsonify({
            'error': 'Failed to fetch transcript',
            'details': str(e)
        }), 500
    
@app.route('/list-transcripts', methods=['GET'])
def list_transcripts():
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blobs = bucket.list_blobs(prefix='transcripts/')

        transcripts = []
        for blob in blobs:
            if blob.name.endswith('.json'):
                transcripts.append({
                    'filename': blob.name,
                    'hearing_id': blob.name.replace('transcripts/', '').replace('.json', ''),
                    'size': blob.size,
                    'created': blob.time_created.isoformat() if blob.time_created else None,
                    'gcs_path': f"gs://{BUCKET_NAME}/{blob.name}"
                })
        
        return jsonify({
            'transcripts': transcripts,
            'count': len(transcripts)
        })
    except Exception as e:
        return jsonify({
            'error': 'Failed to list transcripts',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"\n{'='*60}")
    print(f"Starting Transcription API on port {port}")
    print(f"Model: {MODEL_NAME}")
    print(f"GCS Bucket: {BUCKET_NAME}")
    print(f"Chunk Length: {CHUNK_LENGTH_MS / 1000 / 60} minutes")
    print(f"{'='*60}\n")
    
    app.run(host='0.0.0.0', port=port, debug=True)