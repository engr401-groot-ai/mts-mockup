# Local Development Setup Guide

> Complete guide to set up the MTS project on your local machine from scratch.

---

## Overview

This project consists of:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend API**: Node.js/Express server (TypeScript)
- **Python Transcription Service**: Flask API with Whisper AI and Google Cloud Storage
- **External Dependencies**: Google Cloud Storage, FFmpeg, yt-dlp

---

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Python** (v3.9 or higher) - [Download here](https://www.python.org/downloads/)
- **Git** - [Download here](https://git-scm.com/downloads/)
- **FFmpeg** - Required for audio processing (see installation below)
- **npm** - Comes with Node.js

---

## Phase 1: System Dependencies

### Install FFmpeg

FFmpeg is required for audio/video processing in the transcription service.

#### macOS (using Homebrew)
```bash
brew install ffmpeg
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### Windows (using Chocolatey)
```bash
choco install ffmpeg
```

Or download from [ffmpeg.org](https://ffmpeg.org/download.html)

### Verify FFmpeg Installation
```bash
ffmpeg -version
```

---

## Phase 2: Clone Repository

```bash
# Clone the repository
git clone https://github.com/engr401-groot-ai/mts-mockup.git
cd mts-mockup
```

---

## Phase 3: Google Cloud Setup

### What You Need
You'll need access to the **Google Cloud service account JSON key file** for the project's Google Cloud Storage bucket. This file authenticates your local environment with Google Cloud.

> **Important**: You do **NOT** need to install the `gcloud` CLI or run `gcloud init`. You only need the JSON key file.

### Steps

1. **Obtain the Service Account Key**
   
   **Option A: Get from other member**
   - Request the key JSON key file from another member 
   - **Everyone uses the same key file** - no need to create individual keys
   - Place it in a secure location on your computer
   
   **Option B: Download from Google Cloud Console**
   - Visit Google Cloud Console: [https://console.cloud.google.com/](https://console.cloud.google.com/)
   - Log in and select the **'ITS-GRO'** project from the project dropdown
   - Navigate to **IAM & Admin** → **Service Accounts** (from the side menu)
   - Find the service account: `groot-ai@its-gro.iam.gserviceaccount.com`
   - Click on the service account, then go to the **Keys** tab
   - Click **Add Key** → **Create new key** → Select **JSON**
   - The key file will download automatically
   - Save it to a secure location on your computer
   
   > **Note**: Option A is preferred to avoid creating unnecessary keys. The same JSON key file works for all team members.

2. **Note the File Path**
   - You'll need the absolute path to this file for your `.env` configuration

> **Security Notes**: 
> - Never commit this JSON file to git (it's already in `.gitignore`)
> - Keep this file secure - it provides access to the project's Google Cloud resources
> - Share it only through secure channels

---

## Phase 4: Node.js Frontend & Backend Setup

> **Make sure you're in the project directory**: `cd mts-mockup`

### 1. Install Node.js Dependencies

Navigate to the project directory if you haven't already

Then install all Node.js dependencies:

```bash
npm install
```

This installs all dependencies including:
- React, React Router, TypeScript
- Vite (build tool)
- Tailwind CSS, shadcn/ui components
- Express server dependencies
- Google Cloud client libraries

### 2. Create Environment File

Create a `.env` file in the project root:

```bash
touch .env
```

Add the following configuration (update paths as needed):

```env
# Google Cloud Configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
GCS_BUCKET=hearing_videos

# Python API Configuration
PORT=5001
PYTHON_API_URL=http://localhost:5001

# Whisper Model Configuration (optional - defaults to large-v3-turbo)
WHISPER_MODEL_NAME=large-v3-turbo
```

**Important**: Replace `/path/to/your/service-account-key.json` with your actual path

---

## Phase 5: Python Environment Setup

### 1. Create Python Virtual Environment

```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# On macOS/Linux:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate
```

You should see `(.venv)` in your terminal prompt.

### 2. Install Python Dependencies

```bash
pip install --upgrade pip

# Install required packages
pip install flask flask-cors openai-whisper google-cloud-storage yt-dlp
```

**Key Python Packages:**
- `flask` - Web framework for the API
- `flask-cors` - Cross-Origin Resource Sharing support
- `openai-whisper` - AI transcription model (this will download the model on first use)
- `google-cloud-storage` - Google Cloud Storage client
- `yt-dlp` - YouTube video/audio downloader

### 3. Verify Python Setup

```bash
# Check Python version
python --version

# Verify packages installed
pip list | grep -E "(flask|whisper|google-cloud-storage|yt-dlp)"
```

---

## Phase 6: Running the Application

The application has three components that need to run simultaneously:

### Terminal 1: Frontend Development Server

```bash
npm run dev
```

This starts the Vite development server, typically at `http://localhost:8080`.

**Expected output:**
```
VITE v6.x.x  ready in XXX ms

➜  Local:   http://localhost:8080/
➜  Network: use --host to expose
```

### Terminal 2: Node.js Backend API

```bash
npx tsx api/server.ts
```

This starts the Express server at `http://localhost:3001`.

**Expected output:**
```
Server running on http://localhost:3001
Python API: http://localhost:5001
```

### Terminal 3: Python Transcription Service

Make sure your virtual environment is activated first!

```bash
# Activate if not already active
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate     # Windows

# Run the Flask API
python api/hearing-transcription.py
```

This starts the Python Flask API at `http://localhost:5001`.

**Expected output:**
```
Loading Whisper model...
Model 'large-v3-turbo' loaded successfully.
 * Running on http://127.0.0.1:5001
```

> **Note**: The first time you run the Python service, Whisper will download the AI model (~2GB for large-v3-turbo). This is a one-time download.

---

## Phase 7: Verify Everything Works

### 1. Check Frontend
Open your browser to `http://localhost:8080`

You should see the MTS interface.

### 2. Check API Health

**Node.js API:**
```bash
curl http://localhost:3001/health
```

**Python API:**
```bash
curl http://localhost:5001/health
```

Both should return status information.
