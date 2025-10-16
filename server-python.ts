/* eslint-disable @typescript-eslint/no-explicit-any */
// NEW SERVER: Integrates with Python Whisper API
// RUN: npx tsx server-python.ts

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';

app.use(cors());
app.use(express.json());

interface PythonTranscriptResponse {
  transcript: {
    id: string;
    youtube_url: string;
    title: string;
    text: string;
    language: string;
    duration: number;
    processing_time: number;
    model: string;
    segments: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
      words: Array<{
        word: string;
        start: number;
        end: number;
        probability: number;
      }>;
    }>;
    created_at: string;
    total_segments: number;
  };
  gcs_path: string;
  cached: boolean;
  stats?: {
    duration_minutes: number;
    processing_time_minutes: number;
    segments: number;
    model: string;
  };
}

/**
 * POST /api/transcribe
 * Forward request to Python API for transcription
 */
app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { youtubeUrl, hearingId } = req.body;
  
  console.log('\n='.repeat(60));
  console.log('Received transcription request');
  console.log('YouTube URL:', youtubeUrl);
  console.log('Hearing ID:', hearingId || 'auto-generated');
  console.log('='.repeat(60) + '\n');
  
  if (!youtubeUrl) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  try {
    console.log('Forwarding to Python API:', PYTHON_API_URL);
    
    // Call Python API
    const response = await axios.post<PythonTranscriptResponse>(
      `${PYTHON_API_URL}/transcribe`,
      {
        youtube_url: youtubeUrl,
        hearing_id: hearingId
      },
      {
        timeout: 3600000, // 1 hour timeout for very long videos
        onDownloadProgress: (progressEvent) => {
          // You could implement WebSocket to send progress to client here
          console.log('Receiving data from Python API...');
        }
      }
    );
    
    console.log('\n='.repeat(60));
    console.log('Transcription completed!');
    console.log('Cached:', response.data.cached);
    console.log('GCS Path:', response.data.gcs_path);
    if (response.data.stats) {
      console.log('Duration:', response.data.stats.duration_minutes.toFixed(2), 'minutes');
      console.log('Processing Time:', response.data.stats.processing_time_minutes.toFixed(2), 'minutes');
      console.log('Segments:', response.data.stats.segments);
    }
    console.log('='.repeat(60) + '\n');
    
    // Format response to match your existing frontend expectations
    const formattedResponse = {
      transcription: response.data.transcript.segments.map(seg => ({
        transcript: seg.text,
        words: seg.words.map(w => ({
          word: w.word,
          startTime: w.start,
          endTime: w.end
        }))
      })),
      fullText: response.data.transcript.text,
      youtube_url: response.data.transcript.youtube_url,
      segments: response.data.transcript.segments,
      gcsPath: response.data.gcs_path,
      cached: response.data.cached,
      metadata: {
        id: response.data.transcript.id,
        title: response.data.transcript.title,
        duration: response.data.transcript.duration,
        processingTime: response.data.transcript.processing_time,
        model: response.data.transcript.model,
        totalSegments: response.data.transcript.total_segments
      }
    };
    
    res.json(formattedResponse);
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('ERROR during transcription');
    console.error('='.repeat(60));
    
    if (axios.isAxiosError(error)) {
      console.error('Python API Error:', error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: 'Transcription failed',
        details: error.response?.data?.details || error.message
      });
    } else {
      console.error('Unexpected error:', error);
      res.status(500).json({
        error: 'Failed to transcribe video',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/transcript/:hearingId
 * Get existing transcript from Python API/GCS
 */
app.get('/api/transcript/:hearingId', async (req: Request, res: Response) => {
  const { hearingId } = req.params;
  
  console.log('Fetching transcript:', hearingId);
  
  try {
    const response = await axios.get(
      `${PYTHON_API_URL}/transcript/${hearingId}`
    );

    console.log('YouTube URL from Python:', response.data.transcript?.youtube_url);

    const t = response.data.transcript;
    console.log(`📄 ${t.id} | "${t.title}" | ${t.youtube_url} | ${Math.round(t.duration)}s | ${t.text?.length || 0} chars`);
    
    // Format to match frontend expectations
    const formattedResponse = {
      transcription: response.data.transcript.segments.map((seg: any) => ({
        transcript: seg.text,
        words: seg.words.map((w: any) => ({
          word: w.word,
          startTime: w.start,
          endTime: w.end
        }))
      })),
      fullText: response.data.transcript.text,
      youtube_url: response.data.transcript.youtube_url,
      segments: response.data.transcript.segments,
      gcsPath: response.data.gcs_path,
      metadata: {
        id: response.data.transcript.id,
        title: response.data.transcript.title,
        duration: response.data.transcript.duration,
        model: response.data.transcript.model
      }
    };

    console.log('Formatted response youtube_url:', formattedResponse.youtube_url);
    
    res.json(formattedResponse);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      res.status(404).json({ error: 'Transcript not found' });
    } else {
      console.error('Error fetching transcript:', error);
      res.status(500).json({ error: 'Failed to fetch transcript' });
    }
  }
});

/**
 * GET /api/transcripts
 * List all transcripts
 */
app.get('/api/transcripts', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_API_URL}/list-transcripts`);
    res.json(response.data);
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

/**
 * GET /health
 * Check health of both Node.js and Python services
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const pythonHealth = await axios.get(`${PYTHON_API_URL}/health`, {
      timeout: 5000
    });
    
    res.json({
      status: 'healthy',
      node: {
        status: 'running',
        port: PORT
      },
      python: pythonHealth.data
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      node: {
        status: 'running',
        port: PORT
      },
      python: {
        status: 'unreachable',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('Node.js Server Started');
  console.log('='.repeat(60));
  console.log('Port:', PORT);
  console.log('Python API:', PYTHON_API_URL);
  console.log('='.repeat(60) + '\n');
  
  // Test Python API connection
  axios.get(`${PYTHON_API_URL}/health`)
    .then(response => {
      console.log('✅ Python API is reachable');
      console.log('   Model:', response.data.model);
      console.log('   Bucket:', response.data.gcs_bucket);
    })
    .catch(error => {
      console.log('❌ WARNING: Python API is not reachable');
      console.log('   Make sure to run: python3 api/transcription_api.py');
    });
});
