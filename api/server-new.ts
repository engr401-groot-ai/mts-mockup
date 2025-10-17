/* eslint-disable @typescript-eslint/no-explicit-any */
// RUN: npx tsx server.ts

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import type { 
    PythonAPIResponse, 
    TranscriptionRequest, 
    ClientResponse, 
    Metadata,
    TranscriptListItem 
} from '../src/types/hearings';

dotenv.config();

const app = express();
const PORT = 3001;
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5000';
const REQUEST_TIMEOUT = 3600000;

app.use(cors());
app.use(express.json());

function formatTranscriptResponse(data: PythonAPIResponse): ClientResponse {
    return {
        transcription: data.transcript.segments.map(seg => ({
            transcript: seg.text,
            words: seg.words.map(w => ({
                word: w.word,
                startTime: w.start,
                endTime: w.end
            }))
        })),
        fullText: data.transcript.text,
        youtube_url: data.metadata.youtube_url,
        segments: data.transcript.segments,
        folderPath: data.folder_path,
        metadataPath: data.metadata_path,
        transcriptPath: data.transcript_path,
        cached: data.cached,
        metadata: data.metadata,
        transcriptInfo: {
            model: data.transcript.model,
            processing_time: data.transcript.processing_time,
            total_segments: data.transcript.total_segments,
            language: data.transcript.language
        }
    };
}

// Post endpoint to handle transcribing new videos
app.post('/api/transcribe', async (req: Request, res: Response) => {
    const { youtubeUrl, year, topic, billName, videoTitle, hearingDate } = req.body;

    console.log('Received transcription request for URL:', youtubeUrl);

    // Validate required fields
    if (!youtubeUrl || !year || !topic || !billName || !videoTitle) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required: ['youtubeUrl', 'year', 'topic', 'billName', 'videoTitle', 'hearingDate']
        });
    }

    try {
        console.log('Forwarding request to Python API at:', PYTHON_API_URL);

        const requestPayload: TranscriptionRequest = {
            youtube_url: youtubeUrl,
            year: year,
            topic: topic,
            bill_name: billName,
            video_title: videoTitle,
            hearing_date: hearingDate || new Date().toISOString().split('T')[0]
        };

        const response = await axios.post<PythonAPIResponse>(
            `${PYTHON_API_URL}/transcribe`, 
            requestPayload,
            {
                timeout: REQUEST_TIMEOUT,
                onDownloadProgress: () => {
                    console.log('Receiving data from Python API...');
                }
            }
        );

        console.log('Transcription successful!', response.data.folder_path);
        if (response.data.stats) {
            console.log('Duration:', response.data.stats.duration_minutes.toFixed(2), 'minutes');
            console.log('Processing Time:', response.data.stats.processing_time_minutes.toFixed(2), 'minutes');
            console.log('Segments:', response.data.stats.segments);
        }

        const formattedResponse = formatTranscriptResponse(response.data);
        
        res.json(formattedResponse);
    } catch (error) {
        console.error('Error during transcription:', error);

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


// Get endpoint to retrieve a specific transcripts
app.get('/api/transcript/:year/:topic/:billName/:videoTitle', async (req: Request, res: Response) => {
    const { year, topic, billName, videoTitle } = req.params;
    const folderPath = `${year}/${topic}/${billName}/${videoTitle}`;

    console.log('Fetching transcript from folder:', folderPath);

    try {
        const response = await axios.get<PythonAPIResponse>(
            `${PYTHON_API_URL}/transcript/${encodeURIComponent(folderPath)}`
        );

        console.log('Retreived transcript for: ', response.data.metadata?.title);

        const formattedResponse = formatTranscriptResponse(response.data);

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

// Get endpoint to list all transcripts
app.get('/api/transcripts', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_API_URL}/list-transcripts`);
    
    const formattedTranscripts: TranscriptListItem[] = response.data.transcripts.map((t: Metadata) => ({
      hearing_id: t.hearing_id,
      title: t.title,
      date: t.date,
      duration: t.duration,
      duration_minutes: Math.round(t.duration / 60),
      youtube_url: t.youtube_url,
      year: t.year,
      topic: t.topic,
      bill_name: t.bill_name,
      video_title: t.video_title,
      folder_path: t.folder_path,
      created_at: t.created_at
    }));
    
    res.json({
      transcripts: formattedTranscripts,
      count: response.data.count
    });
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

// Get endpoint for health check
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

// Start the server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('Node.js+Express Server Started');
  console.log('='.repeat(60));
  console.log('Port:', PORT);
  console.log('Python API:', PYTHON_API_URL);
  console.log('='.repeat(60) + '\n');
  
  axios.get(`${PYTHON_API_URL}/health`)
    .then(response => {
      console.log('   Python API is reachable');
      console.log('   Model:', response.data.model);
      console.log('   Bucket:', response.data.gcs_bucket);
      console.log('   Chunk Length:', response.data.chunk_length_minutes, 'minutes');
    })
    .catch(() => {
      console.log('   WARNING: Python API is not reachable');
      console.log('   Make sure to run: python3 api/whisper_to_gcs.py');
    });
});