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
/**
 * Express proxy for the Python transcription service.
 *
 * This server forwards transcription-related requests from the frontend to
 * the Python API, performs lightweight validation/formatting, and exposes
 * convenient endpoints for the UI.
 */

const app = express();
const PORT = 3001;
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';
const REQUEST_TIMEOUT = 3600000;

app.use(cors());
app.use(express.json());

function formatTranscriptResponse(data: PythonAPIResponse): ClientResponse {
    const transcript = data.transcript ?? { segments: [], text: "", model: "", processing_time: 0, total_segments: 0, language: "" };
    
    return {
        transcription: transcript.segments.map(seg => ({
            transcript: seg.text,
            words: seg.words?.map(w => ({
                word: w.word,
                startTime: w.start,
                endTime: w.end
            })) ?? []
        })),
        fullText: transcript.text,
        youtube_url: data.metadata?.youtube_url ?? "",
        segments: transcript.segments,
        folderPath: data.folder_path ?? "",
        cached: data.cached ?? false,
        metadata: data.metadata ?? {},
        transcriptInfo: {
            model: transcript.model,
            processing_time: transcript.processing_time,
            total_segments: transcript.total_segments,
            language: transcript.language
        }
    };
}

/**
 * POST /api/transcribe
 *
 * Validate the request body and forward the transcription request to the
 * Python service. Returns the formatted transcript when available or a
 * 202 accepted response if the Python service queued the job.
 */
app.post('/api/transcribe', async (req: Request, res: Response) => {
    const { youtube_url, year, committee, bill_name, bill_ids, video_title, hearing_date, room, ampm } = req.body;

  const validatedHearingDate = hearing_date || new Date().toISOString().split('T')[0];
  const hasCommittee = Array.isArray(committee) ? committee.length > 0 : !!committee;
  if (!youtube_url || !year || !hasCommittee || !bill_name || !video_title) {
    console.log('Validation failed:', { youtube_url: !!youtube_url, year: !!year, hasCommittee, bill_name: !!bill_name, video_title: !!video_title });
        
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['youtube_url', 'year', 'committee', 'bill_name', 'video_title', 'hearing_date'],
      received: { youtube_url, year, committee, bill_name, video_title, hearing_date }
    });
  }

    try {
        console.log('Transcribing:', { year, committee, bill_name, video_title });

    const requestPayload: TranscriptionRequest = {
      youtube_url: youtube_url,
      year: year,
      committee: committee,
      bill_name: bill_name,
      bill_ids: bill_ids,
      video_title: video_title,
      hearing_date: hearing_date || new Date().toISOString().split('T')[0],
      room: room,
      ampm: ampm
    };

        const response = await axios.post<PythonAPIResponse>(
            `${PYTHON_API_URL}/transcribe`, 
            requestPayload,
            { timeout: REQUEST_TIMEOUT }
        );
        
    console.log('Python /transcribe response:', JSON.stringify(response.data || {}, null, 2));

    const resp: any = response.data;

    if (!resp) {
      return res.status(202).json({ status: 'queued', message: 'Job queued' });
    }

    if (resp.status === 'queued') {
      return res.status(202).json({
        status: resp.status,
        folder_path: resp.folder_path,
        message: resp.message ?? 'Job queued'
      });
    }

    if (resp.transcript) {
      const formattedResponse = formatTranscriptResponse(resp as PythonAPIResponse);
      return res.json(formattedResponse);
    }

    return res.json(resp);
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

/**
 * GET /api/transcript/:year/:committee/:billName/:videoTitle
 *
 * Retrieve a single transcript from the Python API and map it to the
 * client response shape used by the frontend.
 */
app.get('/api/transcript/:year/:committee/:billName/:videoTitle', async (req: Request, res: Response) => {
  const { year, committee, billName, videoTitle } = req.params;

  const normalizeCommittee = (c: string | undefined) => {
    if (!c) return 'UNKNOWN';
    const parts = String(c).split(/[,\-]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return 'UNKNOWN';
    return parts.map(p => p.replace(/\s+/g, '').toUpperCase()).join('-');
  };

  const committeeSlug = normalizeCommittee(committee);
  const folderPath = `${year}/${committeeSlug}/${billName}/${videoTitle}`;
  const encodedFolderPath = encodeURI(folderPath);

  console.log('GET /api/transcript -> folderPath:', folderPath, 'encoded:', encodedFolderPath);

  try {
    const response = await axios.get<PythonAPIResponse>(
      `${PYTHON_API_URL}/transcript/${encodedFolderPath}`
    );

    console.log('Retrieved:', response.data.metadata?.title);

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

/**
 * GET /api/transcripts
 *
 * Proxy to the Python service to list available transcripts. Normalizes
 * the metadata shape for easier client consumption.
 */
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
      committee: t.committee,
      bill_name: t.bill_name,
      video_title: t.video_title,
      room: t.room,
      ampm: t.ampm,
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

/**
 * GET /health
 *
 * Returns combined health information for the Node proxy and the Python
 * transcription service (if reachable).
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