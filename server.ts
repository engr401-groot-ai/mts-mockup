// RUN IN TERMINAL npx tsx server.ts

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { transcribeYoutubeVideo } from './src/lib/youtubeTranscriber.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { youtubeUrl } = req.body;
  
  console.log('Received transcription request for:', youtubeUrl);
  
  if (!youtubeUrl) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  try {
    // Check if required environment variables are set
    const gcsBucket = process.env.GCS_BUCKET;
    if (!gcsBucket) {
      return res.status(500).json({ 
        error: 'GCS_BUCKET environment variable is not set' 
      });
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(500).json({ 
        error: 'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set' 
      });
    }

    console.log('Starting transcription process...');
    const transcription = await transcribeYoutubeVideo(youtubeUrl, gcsBucket);
    
    console.log('Transcription completed successfully');
    res.json({ transcription });
  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).json({ 
      error: 'Failed to transcribe video',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'Server is running',
    env: {
      gcsBucket: process.env.GCS_BUCKET ? 'Set' : 'Not set',
      googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`GCS Bucket: ${process.env.GCS_BUCKET || 'Not set'}`);
  console.log(`Google Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set'}`);
});