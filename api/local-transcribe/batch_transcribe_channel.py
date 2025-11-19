#!/usr/bin/env python3
"""
Batch transcribe videos from a YouTube channel, filtering by year.
Uses local_transcribe.py for each video to avoid cloud uploads.
"""

import os
import re
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed
import yt_dlp
import time

def sanitize_path(component):
    if not component:
        return ''
    component = str(component).strip()
    component = component.replace('..', '').replace('/', '').replace('\\', '')
    component = re.sub(r'[^\w\s\-]', '_', component)
    return component

def get_channel_videos(channel_url, year_filter=None, limit=None):
    """
    Fetch video list from a YouTube channel, optionally filtered by year.
    Returns list of dicts with video info.
    """
    print(f"Fetching videos from: {channel_url}")
    if year_filter:
        print(f"Filtering for year: {year_filter}")
    
    # First pass: get video IDs. We support three cases:
    # 1) direct playlist URL(s) -> expand playlist entries
    # 2) channel '/playlists' page -> fetch each playlist and expand
    # 3) channel videos page -> fetch video ids directly
    videos = []
    video_items = []  # list of dicts {'id': id, 'playlist_title': title or None}
    seen_ids = set()

    print("Fetching video list...")
    # Use a YoutubeDL instance to fetch initial page
    ydl_opts_initial = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
        'playlistend': limit * 3 if limit else None,
    }

    with yt_dlp.YoutubeDL(ydl_opts_initial) as ydl:
        try:
            info = ydl.extract_info(channel_url, download=False)
        except Exception as e:
            print(f"Error fetching channel/playlist: {e}")
            return videos

    # If the provided URL is a playlists index (contains '/playlists' or returned entries look like playlists),
    # iterate playlists and expand each playlist into its constituent videos.
    playlist_page = False
    try:
        if isinstance(channel_url, str) and ('/playlists' in channel_url):
            playlist_page = True
        # If initial extract returned entries that look like playlists (their 'url' contains 'list='), treat as playlist page
        entries = info.get('entries') if isinstance(info, dict) else None
        # Safer detection: loop entries and check url or ie_key
        if entries:
            playlist_like = False
            for e in entries:
                if not isinstance(e, dict):
                    continue
                url_field = e.get('url') or e.get('webpage_url') or ''
                ie_key = e.get('ie_key') or ''
                if 'list=' in url_field or ie_key == 'YoutubePlaylist':
                    playlist_like = True
                    break
            if playlist_like:
                playlist_page = True
    except Exception:
        playlist_page = playlist_page

    # Helper to expand a playlist URL into video items (id + playlist title)
    def expand_playlist(playlist_url, ydl):
        items = []
        try:
            pinfo = ydl.extract_info(playlist_url, download=False)
            pentries = pinfo.get('entries') if isinstance(pinfo, dict) else None
            ptitle = pinfo.get('title') if isinstance(pinfo, dict) else None
            if pentries:
                for pe in pentries:
                    if not pe:
                        continue
                    vid = pe.get('id') or pe.get('url') or pe.get('webpage_url')
                    if not vid:
                        continue
                    m = re.search(r'(?:v=|/watch\?v=|/embed/|/v/|/)([A-Za-z0-9_-]{11})', str(vid))
                    if m:
                        items.append({'id': m.group(1), 'playlist_title': ptitle})
                    elif re.fullmatch(r'[A-Za-z0-9_-]{11}', str(vid)):
                        items.append({'id': str(vid), 'playlist_title': ptitle})
        except Exception as e:
            print(f"  ✗ Error expanding playlist {playlist_url}: {e}")
        return items

    # If it's a playlists page, iterate playlist entries and expand them
    if playlist_page and entries:
        ydl_opts_playlist = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        with yt_dlp.YoutubeDL(ydl_opts_playlist) as ydlp:
            for entry in entries:
                if not entry:
                    continue
                # entry may be playlist metadata or a dict containing playlist url
                purl = None
                if isinstance(entry, dict):
                    purl = entry.get('url') or entry.get('webpage_url')
                    # sometimes 'id' contains list id
                    if not purl and entry.get('id') and len(entry.get('id')) > 0:
                        maybe = entry.get('id')
                        if len(maybe) > 0:
                            purl = f"https://www.youtube.com/playlist?list={maybe}"
                else:
                    purl = str(entry)

                if not purl:
                    continue

                ids = expand_playlist(purl, ydlp)
                for item in ids:
                    vid = item.get('id')
                    ptitle = item.get('playlist_title')
                    if vid not in seen_ids:
                        seen_ids.add(vid)
                        video_items.append({'id': vid, 'playlist_title': ptitle})
                        if limit and len(video_items) >= limit:
                            break
                if limit and len(video_items) >= limit:
                    break

    else:
        # Fallback: initial extraction likely contains video entries or a single video
        entries = info.get('entries') if isinstance(info, dict) else None
        playlist_title = info.get('title') if isinstance(info, dict) else None
        if not entries:
            maybe_id = info.get('id') if isinstance(info, dict) else None
            if maybe_id:
                video_items.append({'id': maybe_id, 'playlist_title': playlist_title})
        else:
            for entry in entries:
                if not entry:
                    continue
                vid = None
                if isinstance(entry, dict):
                    vid = entry.get('id') or entry.get('url') or entry.get('webpage_url')
                else:
                    vid = str(entry)

                if vid:
                    m = re.search(r'(?:v=|/watch\?v=|/embed/|/v/|/)([A-Za-z0-9_-]{11})', str(vid))
                    if m:
                        if m.group(1) not in seen_ids:
                            seen_ids.add(m.group(1))
                            video_items.append({'id': m.group(1), 'playlist_title': playlist_title})
                    else:
                        if re.fullmatch(r'[A-Za-z0-9_-]{11}', str(vid)) and vid not in seen_ids:
                            seen_ids.add(vid)
                            video_items.append({'id': vid, 'playlist_title': playlist_title})
        extra = {'playlist_title': playlist_title}
    
    print(f"Found {len(video_items)} videos total")
    if len(video_items) == 0:
        if playlist_page:
            print("No videos found in playlist page — check that playlists are public and the URL is correct.")
        else:
            print("No videos found on the channel page — yt-dlp may need different extraction options.")
    
    # Second pass: fetch full metadata for each video to get upload dates
    print("Fetching video metadata (this may take a moment)...")
    ydl_opts_full = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,  # Get full metadata
    }
    
    checked_count = 0
    with yt_dlp.YoutubeDL(ydl_opts_full) as ydl:
        for item in video_items:
            video_id = item.get('id')
            playlist_title = item.get('playlist_title')
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            try:
                video_info = ydl.extract_info(video_url, download=False)
                
                title = video_info.get('title', 'Untitled')
                upload_date = video_info.get('upload_date')  # Format: YYYYMMDD
                duration = video_info.get('duration', 0)
                
                # Parse upload date
                video_year = None
                video_date = None
                if upload_date:
                    try:
                        video_year = int(upload_date[:4])
                        video_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
                    except (ValueError, IndexError):
                        pass
                
                # Filter by year if specified
                if year_filter:
                    if not video_year or video_year != year_filter:
                        checked_count += 1
                        continue
                
                entry = {
                    'id': video_id,
                    'url': video_url,
                    'title': title,
                    'upload_date': video_date,
                    'year': video_year,
                    'duration': duration,
                }
                # attach playlist title when present (from expansion)
                try:
                    if playlist_title:
                        entry['playlist_title'] = playlist_title
                    elif 'extra' in locals() and extra.get('playlist_title'):
                        entry['playlist_title'] = extra.get('playlist_title')
                except Exception:
                    pass
                videos.append(entry)
                
                print(f"  ✓ {title[:60]}... ({video_date})")
                checked_count += 1
                
                # Stop if we've hit the limit
                if limit and len(videos) >= limit:
                    break
                
            except Exception as e:
                print(f"  ✗ Error fetching video {video_id}: {e}")
                checked_count += 1
                continue
    
    print(f"\nChecked {checked_count} videos, found {len(videos)} matching {year_filter if year_filter else 'all years'}")
    return videos

def parse_hearing_info(title, upload_date):
    """
    Attempt to extract committee, bill, and other info from video title.
    Returns dict with parsed fields.
    
    Args:
        title: Video title
        upload_date: Upload date string (YYYY-MM-DD)
        hearing_type: 'floor' for floor sessions, 'committee' for committee hearings
    """
    # Common patterns in Hawaii legislature videos
    
    info = {
        'committee': [],
        'bill_name': '',
        'bill_ids': [],
        'video_title': title,
        'room': '',
        'ampm': 'AM',
    }
    
    # Auto-detect hearing type from title. If title indicates a floor session, treat as 'floor', else 'committee'.
    title_lower = title.lower() if isinstance(title, str) else ''
    if any(k in title_lower for k in ('floor session', 'floor', 'floor session', 'floor hearing')):
        hearing_type = 'floor'
    else:
        hearing_type = 'committee'

    if hearing_type == 'committee':
        # Committee hearing patterns:
        # "JHA 01/28/25 2:00 PM"
        # "HEARING JHA 01-28-25"
        # "Committee on Judiciary & Hawaiian Affairs - Jan 28, 2025"
        
        # Extract committee abbreviations (3-4 letter codes)
        committee_match = re.search(r'\b([A-Z]{3,4})\b', title)
        if committee_match:
            info['committee'] = [committee_match.group(1)]
        
        # Extract date from title to use as bill_name
        date_patterns = [
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',  # 01/28/25 or 01-28-2025
            r'([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})',  # January 28, 2025
        ]
        
        date_str = None
        for pattern in date_patterns:
            date_match = re.search(pattern, title)
            if date_match:
                date_str = date_match.group(1).replace('/', '-').replace(' ', '_')
                break
        
        if date_str:
            info['bill_name'] = f"Hearing_{date_str}"
        elif upload_date:
            info['bill_name'] = f"Hearing_{upload_date.replace('-', '')}"
        else:
            info['bill_name'] = "Unknown"
        
        # Extract time and AM/PM
        time_match = re.search(r'(\d{1,2}):(\d{2})\s*(AM|PM)', title, re.IGNORECASE)
        if time_match:
            info['ampm'] = time_match.group(3).upper()
        
        # Fallback for committee
        if not info['committee']:
            # Try to extract from full committee names
            committee_names = {
                'judiciary': 'JHA',
                'hawaiian': 'JHA',
                'education': 'EDU',
                'finance': 'FIN',
                'health': 'HLT',
                'housing': 'HOU',
                'agriculture': 'AGR',
                'energy': 'EEP',
                'tourism': 'TOU',
                'transportation': 'TRN',
                'labor': 'LAB',
                'ways and means': 'WAM',
                'water': 'WTL',
            }
            title_lower = title.lower()
            for keyword, abbr in committee_names.items():
                if keyword in title_lower:
                    info['committee'] = [abbr]
                    break

        # If still not found and the video came from a playlist, try to use the playlist title
        # Caller may attach 'playlist_title' into the video metadata and pass it as part of title
        # Here `title` can remain the video title but we'll attempt to pull committee from upload_date if needed
        
    else:  # hearing_type == 'floor'
        # Floor session patterns:
        # "Senate Floor Session 03-27-2025 11:30am"
        # "Floor Session - March 27, 2025"
        
        info['committee'] = ['SENATE']
        
        # Extract date from title
        date_match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})', title)
        if date_match:
            date_str = date_match.group(1).replace('/', '')
            info['bill_name'] = f"Hearing_{date_str}"
        elif upload_date:
            info['bill_name'] = f"Hearing_{upload_date.replace('-', '')}"
        else:
            info['bill_name'] = "Unknown"
        
        # Detect AM/PM
        if re.search(r'\bPM\b|\bafternoon\b|\bevening\b|[5-9]:\d{2}\s*pm', title, re.IGNORECASE):
            info['ampm'] = 'PM'
    
    # Extract bill numbers from title (works for both types)
    bill_matches = re.findall(r'\b((?:HB|SB)\s*\d+)', title, re.IGNORECASE)
    if bill_matches:
        info['bill_ids'] = [b.replace(' ', '').upper() for b in bill_matches]
    
    # Fallback defaults
    if not info['committee']:
        info['committee'] = ['SENATE']
    
    # Clean title for use as video_title (must match local_transcribe.py format)
    # Replace special chars with underscore, then replace spaces with underscores
    info['video_title'] = re.sub(r'[^\w\s-]', '_', title).replace(' ', '_').strip()[:100]

    # If we still don't have committee info and a playlist title is available in the video title
    # (some callers attach playlist info into the video dict as 'playlist_title'), try to extract it.
    try:
        # If the input `title` was actually a dict when called incorrectly, skip; this is defensive.
        pass
    except Exception:
        pass
    
    return info

def check_already_transcribed(year, committee, bill_name, video_title):
    """Check if transcript already exists locally."""
    # We store transcripts by video id (no bill_name). `committee` arg may be list
    committee_slug = '-'.join([c.replace(' ', '').upper() for c in committee]) if committee else 'UNKNOWN'
    # here `bill_name` parameter is unused; expecting caller to pass video_id instead
    video_id_or_title = bill_name or video_title
    folder_path = Path('transcripts') / str(year) / committee_slug / sanitize_path(video_id_or_title)
    transcript_file = folder_path / 'transcript.json'
    return transcript_file.exists()

def transcribe_video(video, year, skip_existing=True):
    """
    Call local_transcribe.py for a single video.
    Returns True if successful, False otherwise.
    """
    info = parse_hearing_info(video['title'], video['upload_date'])

    # If committee not detected and the video came from a playlist, try to infer committee
    if (not info.get('committee') or info.get('committee') == ['SENATE']) and video.get('playlist_title'):
        playlist = video.get('playlist_title', '')
        if playlist:
            playlist_lower = playlist.lower()
            committee_names = {
                'judiciary': 'JHA',
                'hawaiian': 'JHA',
                'education': 'EDU',
                'finance': 'FIN',
                'health': 'HLT',
                'housing': 'HOU',
                'agriculture': 'AGR',
                'energy': 'EEP',
                'tourism': 'TOU',
                'transportation': 'TRN',
                'labor': 'LAB',
                'ways and means': 'WAM',
                'water': 'WTL',
            }
            for keyword, abbr in committee_names.items():
                if keyword in playlist_lower:
                    info['committee'] = [abbr]
                    print(f"Inferred committee '{abbr}' from playlist title: {playlist}")
                    break
    
    # Check if already transcribed
    # Check by video id (avoid using bill_name). Pass video['id'] into the check.
    if skip_existing and check_already_transcribed(
        year,
        info['committee'],
        video.get('id'),
        info['video_title']
    ):
        print(f"\n[SKIP] Already transcribed: {video['title']}")
        return True
    
    print(f"\n{'='*80}")
    print(f"Transcribing: {video['title']}")
    print(f"URL: {video['url']}")
    print(f"Date: {video['upload_date']}")
    print(f"Duration: {video['duration']}s ({video['duration']//60}m {video['duration']%60}s)")
    print(f"Committee: {', '.join(info['committee'])}")
    # Show bill ids (HB/SB...) only
    print(f"Bill IDs: {', '.join(info.get('bill_ids', []) ) or ''}")
    print(f"{'='*80}\n")
    
    # Build command
    cmd = [
        sys.executable, 'api/local-transcribe/local_transcribe.py',
        '--youtube-url', video['url'],
        '--year', str(year),
        '--committee', ','.join(info['committee']),
        '--video-title', info['video_title'],
        '--hearing-date', video['upload_date'] or f"{year}-01-01",
        '--ampm', info['ampm'],
    ]
    
    # bill IDs are inferred by the transcription script from the YouTube description
    
    # Run transcription
    try:
        result = subprocess.run(cmd, check=True, capture_output=False, text=True)
        print(f"\n✅ Successfully transcribed: {video['title']}\n")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Failed to transcribe: {video['title']}")
        print(f"Error: {e}\n")
        return False
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        raise

def transcribe_video_wrapper(video, year, skip_existing, video_num, total_videos):
    """
    Wrapper for transcribe_video to work with ProcessPoolExecutor.
    Returns 'success', 'skipped', or 'failed'.
    """
    print(f"\n\n{'#'*80}")
    print(f"Video {video_num}/{total_videos}")
    print(f"{'#'*80}")
    
    try:
        info = parse_hearing_info(video['title'], video['upload_date'])
        if skip_existing and check_already_transcribed(
            year,
            info['committee'],
            video.get('id'),
            info['video_title']
        ):
            print(f"[SKIP] Already transcribed: {video['title']}")
            return 'skipped'
        
        success = transcribe_video(video, year, skip_existing=skip_existing)
        return 'success' if success else 'failed'
    except KeyboardInterrupt:
        raise
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return 'failed'

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Batch transcribe videos from a YouTube channel (local-only, no cloud)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Transcribe 2025 videos from Hawaii Senate channel (type auto-detected)
    python api/batch_transcribe_channel.py \
        --channel "https://www.youtube.com/@hawaiisenate/videos" \
        --year 2025

    # Transcribe committee hearings (use a playlist URL for a specific committee)
    python api/batch_transcribe_channel.py \
        --channel "https://www.youtube.com/@hawaiisenate/playlists" \
        --year 2025 \
        --limit 10

  # Limit to first 5 videos (for testing)
  python api/batch_transcribe_channel.py \\
    --channel "https://www.youtube.com/@hawaiisenate/videos" \\
    --year 2025 \\
    --limit 5

  # Skip already-transcribed videos (default)
  python api/batch_transcribe_channel.py \\
    --channel "https://www.youtube.com/@hawaiisenate/videos" \\
    --year 2025 \\
    --skip-existing
        """
    )
    
    parser.add_argument(
        '--channel',
        required=True,
        help='YouTube channel URL (e.g., https://www.youtube.com/@hawaiisenate/videos)'
    )
    parser.add_argument(
        '--year',
        type=int,
        default=2025,
        help='Filter videos by upload year (default: 2025)'
    )
    # No explicit hearing type flag: we auto-detect per-video from titles or playlist names
    parser.add_argument(
        '--limit',
        type=int,
        default=8,
        help='Limit number of videos to transcribe (default: 8)'
    )
    parser.add_argument(
        '--start',
        type=int,
        default=0,
        help='Start index (0-based) into the video list to begin transcribing'
    )
    parser.add_argument(
        '--count',
        type=int,
        default=None,
        help='Number of videos to transcribe starting at --start (overrides --limit when set)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=False,
        help='List the videos that would be transcribed and inferred metadata, but do not run transcription'
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        default=True,
        help='Skip videos that are already transcribed (default: true)'
    )
    parser.add_argument(
        '--no-skip-existing',
        action='store_false',
        dest='skip_existing',
        help='Re-transcribe videos even if they exist'
    )
    parser.add_argument(
        '--yes', '-y',
        action='store_true',
        help='Automatically confirm and start transcription without prompting'
    )
    parser.add_argument(
        '--workers',
        type=int,
        default=1,
        help='Number of parallel transcriptions to run at once (default: 1). Use 1 if you have limited RAM.'
    )
    
    args = parser.parse_args()

    # Note: Remove --type flag; we auto-detect hearing type per video using title content
    
    # Validate venv is active
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("⚠️  Warning: Virtual environment not detected. Run: source .venv/bin/activate")
    
    print(f"\n{'='*80}")
    print("Hawaii Senate Hearing Batch Transcription")
    print(f"{'='*80}")
    print(f"Channel: {args.channel}")
    print(f"Year filter: {args.year}")
    print("Hearing type: auto-detected per video from titles/playlists")
    print(f"Skip existing: {args.skip_existing}")
    # Show intended selection behavior: --count/--start take precedence over --limit
    if args.count is not None:
        s = max(0, int(args.start))
        c = max(0, int(args.count))
        end_idx = s + c - 1 if c > 0 else s
        print(f"Selection: start={s} count={c} -> will select indices {s}..{end_idx} (if available) from fetched videos")
    elif args.limit:
        lim = int(args.limit)
        end_idx = max(0, lim - 1)
        print(f"Limit: {lim} videos -> will select indices 0..{end_idx} from fetched videos")
    model_name = os.getenv('WHISPER_MODEL_NAME', 'base')
    print(f"Model: {model_name} (set in local_transcribe.py)")
    print(f"{'='*80}\n")
    
    # Fetch videos. Use args.count as the fetch limit when provided so we don't expand more than requested.
    fetch_limit = args.count if args.count is not None else args.limit
    videos = get_channel_videos(args.channel, year_filter=args.year, limit=fetch_limit)
    
    if not videos:
        print("No videos found matching criteria.")
        return
    
    # Apply slicing: either use --count with --start, otherwise fall back to --limit
    total_found = len(videos)
    if args.count is not None:
        start = max(0, int(args.start))
        end = start + max(0, int(args.count))
        videos = videos[start:end]
        print(f"\nSelected videos {start}..{end} (requested count={args.count}) from {total_found} found")
    elif args.limit:
        videos = videos[:args.limit]
        print(f"\nLimited to first {args.limit} videos")
    
    # Confirm before starting
    model_name = os.getenv('WHISPER_MODEL_NAME', 'base')
    print(f"\n📋 Ready to transcribe {len(videos)} videos")
    if args.dry_run:
        print("\n-- DRY RUN: listing selected videos (no transcription will be started) --\n")
        for i, v in enumerate(videos, start=1):
            info = parse_hearing_info(v.get('title', ''), v.get('upload_date'))
            playlist = v.get('playlist_title', '')
            print(f"{i}. {v.get('title')}\n    URL: {v.get('url')}\n    Inferred committee: {', '.join(info.get('committee', []))}  Bill name: {info.get('bill_name')}  Playlist: {playlist}\n")
        return
    print(f"🤖 Using model: {model_name}")
    print(f"⚡ Parallel workers: {args.workers} videos at a time")
    if model_name == 'large-v3':
        print("⚠️  Note: large-v3 needs 4-6GB RAM. If you run out of memory, use 'medium' or 'base'")
    elif model_name == 'medium':
        print("✓  medium model is memory-efficient (~2GB) and still very accurate")
    elif model_name == 'base':
        print("✓  base model is fast and memory-efficient (~1GB) - best for limited RAM")
    print()
    
    if not args.yes:
        try:
            response = input("Continue? [y/N]: ").strip().lower()
            if response != 'y':
                print("Cancelled.")
                return
        except KeyboardInterrupt:
            print("\nCancelled.")
            return
    else:
        print("Auto-confirmed (--yes flag). Starting transcription...")
    
    # Process videos
    successful = 0
    failed = 0
    skipped = 0
    start_time = time.time()
    
    # Process videos in parallel (configurable for memory safety)
    max_workers = max(1, int(args.workers))  # Number of parallel transcriptions
    
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        # Submit all videos to the executor
        future_to_video = {}
        for i, video in enumerate(videos, 1):
            future = executor.submit(transcribe_video_wrapper, video, args.year, args.skip_existing, i, len(videos))
            future_to_video[future] = (video, i)
        
        # Process completed transcriptions as they finish
        for future in as_completed(future_to_video):
            video, video_num = future_to_video[future]
            try:
                result = future.result()
                if result == 'success':
                    successful += 1
                elif result == 'skipped':
                    skipped += 1
                else:
                    failed += 1
                # Display progress bar + ETA after each completed video
                completed = successful + skipped + failed
                total = len(videos)
                def format_seconds(s):
                    s = int(s)
                    h = s // 3600
                    m = (s % 3600) // 60
                    sec = s % 60
                    if h:
                        return f"{h}h{m}m{sec}s"
                    if m:
                        return f"{m}m{sec}s"
                    return f"{sec}s"

                elapsed = time.time() - start_time
                if completed > 0:
                    avg = elapsed / completed
                    remaining = max(0, int(round(avg * (total - completed))))
                else:
                    avg = None
                    remaining = None

                # Build a simple textual bar
                bar_width = 30
                pct = completed / total if total else 0
                filled = int(pct * bar_width)
                bar = '[' + ('#' * filled).ljust(bar_width) + ']' + f" {completed}/{total}"

                eta_str = format_seconds(remaining) if remaining is not None else 'unknown'
                print(f"[Batch Progress] {bar}  Elapsed: {format_seconds(elapsed)}  ETA: {eta_str}")
            except KeyboardInterrupt:
                print("\n\n⚠️  Batch transcription interrupted by user")
                executor.shutdown(wait=False, cancel_futures=True)
                break
            except Exception as e:
                print(f"\n❌ Unexpected error processing video {video_num}: {e}")
                failed += 1
    
    # Summary
    print(f"\n\n{'='*80}")
    print("BATCH TRANSCRIPTION SUMMARY")
    print(f"{'='*80}")
    print(f"Total videos: {len(videos)}")
    print(f"✅ Successful: {successful}")
    print(f"⏭️  Skipped: {skipped}")
    print(f"❌ Failed: {failed}")
    print(f"{'='*80}\n")
    print(f"Transcripts saved to: ./transcripts/{args.year}/")

if __name__ == '__main__':
    main()
