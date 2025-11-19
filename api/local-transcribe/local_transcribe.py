# Small local-only transcription runner that does NOT touch Google Cloud.
# Usage: python api/local_transcribe.py --youtube-url <url> --year 2025 --committee Education --bill-name BILL --video-title Title

import os
import re
import json
import math
import argparse
import tempfile
import shutil
import subprocess
from pathlib import Path
from datetime import datetime

import yt_dlp

# Allow forcing CPU before importing CUDA/cuDNN-dependent libraries.
# Set `TRANSCRIPTS_FORCE_CPU=1` in the environment or export it in your shell
# to disable GPU usage (this sets `CUDA_VISIBLE_DEVICES` to empty before
# torch/whisperx are imported).
if os.getenv('TRANSCRIPTS_FORCE_CPU', '').lower() in ('1', 'true', 'yes'):
    os.environ['CUDA_VISIBLE_DEVICES'] = ''

import torch
import whisperx

# Config (can be overridden by env)
# base model is most memory-efficient for long videos in limited RAM environments
# base ~1GB, medium ~2GB, large-v3 ~6GB
MODEL_NAME = os.getenv('WHISPER_MODEL_NAME', 'base')
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CHUNK_LENGTH_MS = 15 * 60 * 1000  # optional chunking if used below

def sanitize_path(component):
    if not component:
        return ''
    component = str(component).strip()
    component = component.replace('..', '').replace('/', '').replace('\\', '')
    component = re.sub(r'[^\w\s\-]', '_', component)
    return component

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
            'User-Agent': 'Mozilla/5.0'
        },
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        duration = info.get('duration', 0)
        title = info.get('title', 'unknown_title')

    wav_file = output_path + ".wav"
    print(f"Downloaded: {title}")
    print(f"Audio size: {os.path.getsize(wav_file) / (1024 * 1024):.2f} MB")
    print(f"Duration: {duration // 60} minutes {duration % 60} seconds")
    return wav_file, duration, title

def transcribe_and_align(audio_path, offset_seconds=0, model=None, alignment_model=None, metadata=None):
    print(f"Transcribing: {audio_path} (device={DEVICE})")
    result = model.transcribe(
        audio_path,
        language='en',
        verbose=False,
        print_progress=True,
        batch_size=4,  # Reduced batch size for memory efficiency
    )
    result_aligned = whisperx.align(
        result["segments"],
        alignment_model,
        metadata,
        audio_path,
        DEVICE
    )

    adjusted_segments = []
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

    full_text = " ".join(seg['text'] for seg in adjusted_segments if seg.get('text')).strip()
    return adjusted_segments, full_text

def fetch_youtube_metadata(youtube_url):
    """Fetch full YouTube metadata (description, tags, channel info, etc.)"""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 30,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            
            # Extract video_id from URL if not in info
            video_id = info.get('id', '')
            if not video_id:
                match = re.search(r'(?:v=|/)([a-zA-Z0-9_-]{11})', youtube_url)
                if match:
                    video_id = match.group(1)
            
            return {
                'tags': info.get('tags', []),
                'description': info.get('description', ''),
                'channel': info.get('channel', ''),
                'channel_id': info.get('channel_id', ''),
                'uploader': info.get('uploader', ''),
                'view_count': info.get('view_count', 0),
                'like_count': info.get('like_count', 0),
                'duration': info.get('duration', 0),
                'video_id': video_id,
                'description': info.get('description', ''),
            }
    except Exception as e:
        print(f"⚠️  Warning: Could not fetch YouTube metadata: {str(e)[:100]}")
        return {}

def main():
    parser = argparse.ArgumentParser(description="Local WhisperX transcription (writes to ./transcripts)")
    parser.add_argument('--youtube-url', required=True)
    parser.add_argument('--year', required=True)
    parser.add_argument('--committee', required=True, help="Single committee or comma-separated list")
    parser.add_argument('--video-title', required=True)
    parser.add_argument('--hearing-date', default=datetime.now().strftime('%Y-%m-%d'))
    parser.add_argument('--room', default='')
    parser.add_argument('--ampm', default='AM')

    parser.add_argument('--out-root', default=os.getenv('TRANSCRIPTS_OUT_ROOT', 'transcripts'), help='Root folder to save transcripts (default: transcripts)')
    args = parser.parse_args()

    # prepare folder path; we will store transcripts by video id (no bill_name)
    committees = [c.strip() for c in str(args.committee).split(',') if c.strip()]
    committee_slug = '-'.join([sanitize_path(c).replace(' ', '').upper() for c in committees]) if committees else 'UNKNOWN'

    # load model locally
    print("Loading WhisperX model...", flush=True)
    if DEVICE == "cuda":
        model = whisperx.load_model(MODEL_NAME, device=DEVICE, compute_type="float16")
    else:
        model = whisperx.load_model(MODEL_NAME, device=DEVICE, compute_type="int8")
    alignment_model, metadata = whisperx.load_align_model(language_code='en', device=DEVICE)
    print(f"Loaded model {MODEL_NAME} on {DEVICE}")

    tmp = tempfile.mkdtemp(prefix="local_transcribe_")
    try:
        audio_path, duration, title = download_youtube_audio(args.youtube_url, tmp)

        # Fetch YouTube metadata (description, tags, channel info, etc.)
        print("Fetching YouTube metadata...")
        youtube_metadata = fetch_youtube_metadata(args.youtube_url)

        # Infer bill ids from description (if any)
        def extract_bill_ids_from_text(text):
            """Return normalized bill ids found in text (e.g. 'HB 123' -> 'HB123').

            Scans common variants like 'HB123', 'HB 123', 'H.B. 123', 'SB-45',
            and returns a list of unique uppercase ids.
            """
            if not text:
                return []
            # Normalize punctuation and spacing
            txt = re.sub(r'[\.\-]', ' ', text)
            # Find patterns like HB 123 or SB123
            matches = re.findall(r"\b(?:H\s*B|S\s*B)\s*(\d{1,5})\b", txt, re.IGNORECASE)
            normalized = []
            for num in matches:
                idstr = f"HB{num}" if re.search(r'\bH\s*B\b', txt, re.IGNORECASE) else None
                # The above simple heuristic may miss whether match was HB or SB; instead re-find full matches
            # Better: find full matches preserving HB/SB prefix
            full_matches = re.findall(r"\b((?:H\s*B|S\s*B)\s*\d{1,5})\b", txt, re.IGNORECASE)
            for fm in full_matches:
                clean = re.sub(r'\s+', '', fm).upper().replace('.', '')
                clean = clean.replace('-', '')
                normalized.append(clean)
            # Deduplicate while preserving order
            seen = set()
            result = []
            for x in normalized:
                if x not in seen:
                    seen.add(x)
                    result.append(x)
            return result

        # Try both description and title for better coverage
        inferred_bill_ids = extract_bill_ids_from_text(youtube_metadata.get('description', ''))
        if not inferred_bill_ids:
            inferred_bill_ids = extract_bill_ids_from_text(title)
        print(f"Inferred bill IDs: {inferred_bill_ids}")

        # Store transcripts by video id (no bill_name). video_id should be in youtube_metadata
        video_id = youtube_metadata.get('video_id') or ''
        if not video_id:
            # try to extract from URL as fallback
            m = re.search(r'(?:v=|/)([A-Za-z0-9_-]{11})', args.youtube_url)
            video_id = m.group(1) if m else 'unknown_video'

        folder_path = f"{args.year}/{committee_slug}/{sanitize_path(video_id)}".replace(' ', '_')

        # Simple single-chunk transcription (for long inputs you may want to split)
        segments, full_text = transcribe_and_align(audio_path, model=model, alignment_model=alignment_model, metadata=metadata)

        # Prepare metadata and transcript objects
        metadata_obj = {
            'hearing_id': f"{args.year}_{committee_slug}_{video_id}",
            'title': title,
            'date': args.hearing_date,
            'duration': duration,
            'youtube_url': args.youtube_url,
            'year': args.year,
            'committee': committees,
            'bill_ids': inferred_bill_ids,
            'video_id': video_id,
            'video_title': args.video_title,
            'room': args.room,
            'ampm': args.ampm,
            'folder_path': folder_path,
            'created_at': datetime.now().isoformat(),
        }
        
        # Add YouTube metadata fields if available
        if youtube_metadata:
            metadata_obj.update({
                'tags': youtube_metadata.get('tags', []),
                'description': youtube_metadata.get('description', ''),
                'channel': youtube_metadata.get('channel', ''),
                'channel_id': youtube_metadata.get('channel_id', ''),
                'uploader': youtube_metadata.get('uploader', ''),
                'view_count': youtube_metadata.get('view_count', 0),
                'like_count': youtube_metadata.get('like_count', 0),
                'video_id': youtube_metadata.get('video_id', ''),
            })

        transcript_obj = {
            'hearing_id': metadata_obj['hearing_id'],
            'text': full_text,
            'language': 'en',
            'duration': duration,
            'processing_time': 0,  # you could calculate if desired
            'model': MODEL_NAME,
            'segments': segments,
            'total_segments': len(segments),
            'created_at': datetime.now().isoformat(),
        }

        # Local output directory (configurable)
        out_root = Path.cwd() / args.out_root / Path(folder_path)
        out_root.mkdir(parents=True, exist_ok=True)
        (out_root / "metadata.json").write_text(json.dumps(metadata_obj, ensure_ascii=False, indent=2))
        (out_root / "transcript.json").write_text(json.dumps(transcript_obj, ensure_ascii=False, indent=2))

        print("Saved local transcript to:", out_root)
    finally:
        # cleanup downloads
        try:
            shutil.rmtree(tmp)
        except Exception:
            pass

if __name__ == '__main__':
    main()