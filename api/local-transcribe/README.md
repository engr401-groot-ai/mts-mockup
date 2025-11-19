# Local Transcribe

This folder contains local transcription utilities that run WhisperX locally (no cloud). Two main scripts:

- `local_transcribe.py` — download a YouTube video/audio and transcribe + align with WhisperX. Writes `metadata.json` and `transcript.json` to the `transcripts/` folder.
- `batch_transcribe_channel.py` — fetches videos (or expands playlists) from a YouTube channel/playlists page, infers committee from playlist/title, and calls `local_transcribe.py` for each selection.

## Requirements

- Python 3.10+ (this project uses a `.venv` virtualenv)
- In `.venv` install requirements used by WhisperX (see `api/requirements.txt`). Typical deps: `whisperx`, `yt-dlp`, `torch`, `pyannote`, `torchaudio`, etc.
- `ffmpeg` available on PATH (used by `yt-dlp` to extract audio).

## Quickstart

Activate your venv then run either script with the venv Python:

```bash
source .venv/bin/activate
# Dry-run listing (no transcription)
env TRANSCRIPTS_FORCE_CPU=1 WHISPER_MODEL_NAME=small \
  .venv/bin/python api/local-transcribe/batch_transcribe_channel.py \
  --channel "https://www.youtube.com/@hawaiihouseofrepresentatives/playlists" \
  --dry-run --count 2 --year 2025

# Run 2 videos (CPU forced, auto-confirm)
env TRANSCRIPTS_FORCE_CPU=1 WHISPER_MODEL_NAME=small \
  .venv/bin/python api/local-transcribe/batch_transcribe_channel.py \
  --channel "https://www.youtube.com/@hawaiihouseofrepresentatives/playlists" \
  --count 2 --year 2025 --yes --workers 1
```

Or transcribe a single video directly:

```bash
env TRANSCRIPTS_FORCE_CPU=1 WHISPER_MODEL_NAME=small \
  .venv/bin/python api/local-transcribe/local_transcribe.py \
  --youtube-url "https://www.youtube.com/watch?v=<ID>" \
  --year 2025 --committee WAM --video-title "WAM_Informational_..."
```

## Key flags

- `--year` — filter videos by upload year (batch script).
- `--count` / `--start` — select a slice of videos to transcribe (batch script).
- `--limit` — fallback maximum when `--count` not given.
- `--dry-run` — lists selected videos and inferred metadata (batch script).
- `--yes` / `-y` — skip confirmation and start immediately.
- `TRANSCRIPTS_FORCE_CPU=1` — export `CUDA_VISIBLE_DEVICES=''` before importing torch/whisperx. Use this to avoid CUDA/cuDNN load issues and run entirely on CPU.
- `WHISPER_MODEL_NAME` — model to use (`small`, `base`, `medium`, `large-v3`, ...). Default is `base`.

Limit behavior
 - `--count` and `--start` together explicitly select a slice of videos to transcribe (preferred for predictable runs). When `--count` is provided it is used as the fetch limit and expansion will stop after that many videos are found.
 - If you omit `--count`, the script falls back to `--limit` (default: `8`). That means the batch will not try to transcribe the entire channel by default — it will select up to `8` videos unless you specify otherwise. If you want to process more videos, set `--count` (or increase `--limit`).
 - Note: when expanding playlists (e.g., a `/playlists` page), the script will expand playlist entries but will stop once it has collected the requested number of videos (from `--count` or `--limit`).

## Output layout

Transcripts are saved to the repository under:

```
transcripts/<year>/<COMMITTEE_ABBR>/<video_id>/
```

Each folder contains `metadata.json` and `transcript.json`.

`metadata.json` includes:
- `committee` (array)
- `video_id` and `video_title`
- `bill_ids` — list of normalized bill ids found in the video description/title (e.g., `HB123`, `SB45`). If none are found this is an empty list.

## Notes & Troubleshooting

- If your system has mismatched CUDA/cuDNN and WhisperX/Torch fails with native aborts, use `TRANSCRIPTS_FORCE_CPU=1` (recommended) or install matching cuDNN for your torch/cuda build.
- `batch_transcribe_channel.py` attempts to detect playlist pages (`/playlists`) and expand playlists recursively; it deduplicates video IDs across playlists.
- Long videos are processed on CPU quite slowly — use an appropriate GPU setup if available and compatible.

Platform-specific setup
-----------------------

Below are recommended quick steps per OS to prepare a working environment. These are minimal, focused on getting the scripts in this folder running.

Linux (Debian/Ubuntu)
- Install system deps and create a venv:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip ffmpeg git
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r api/requirements.txt
```

- Notes:
  - If you have an NVIDIA GPU and want GPU acceleration, install matching CUDA and cuDNN for the `torch` package in your venv. If CUDA/cuDNN are mismatched you may see native crashes — use `TRANSCRIPTS_FORCE_CPU=1` to avoid this and run on CPU.

macOS (Homebrew)
- Install Homebrew if needed, then:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install python ffmpeg git
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r api/requirements.txt
```

- Notes:
  - macOS GPUs are not currently supported by the same Torch CUDA builds — CPU runs are typical unless you have a specialized M-series build of PyTorch (follow PyTorch macOS instructions if needed).

Windows
- Recommended: use WSL2 (Ubuntu) for best compatibility. Follow WSL2 setup then use the Linux instructions above inside WSL.
- Native Windows (not recommended): install Python from python.org or via Chocolatey and install `ffmpeg` (choco), then create a venv and install Python deps:

```powershell
# (run as Admin for choco)
choco install -y python ffmpeg
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r api/requirements.txt
```

- Notes:
  - WSL2 provides the most consistent experience with Linux tooling. Native Windows may require additional troubleshooting for audio backends and ffmpeg paths.

GPU and cuDNN notes
-------------------
- If you want GPU acceleration, ensure the system CUDA driver and cuDNN match the `torch` wheel you install in the venv. A mismatch commonly causes native aborts. If you see native crashes or libcudnn errors, either:
  - Install a matching cuDNN/CUDA that corresponds to your `torch` binary, or
  - Force CPU mode by setting `TRANSCRIPTS_FORCE_CPU=1` in the environment before running the scripts.

Example: run a CPU-only batch (safe fallback):

```bash
env TRANSCRIPTS_FORCE_CPU=1 WHISPER_MODEL_NAME=small .venv/bin/python api/local-transcribe/batch_transcribe_channel.py \
  --channel "https://www.youtube.com/@hawaiihouseofrepresentatives/playlists" --count 2 --year 2025 --yes
```

## Extensions

If you want different storage (include sanitized video title under the video id) or to persist raw ASR output before alignment, open an issue or request and I can add that behavior.

---

If you want, I can also add a short `Makefile` or a convenience script to run the batch/transcribe commands with environment variables set.
