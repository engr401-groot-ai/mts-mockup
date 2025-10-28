/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Request, Response } from 'express';
import { postTranscribe } from '../services/pythonProxy';
import { formatTranscriptResponse } from '../services/transcriptFormatter';
import type { PythonAPIResponse, TranscriptionRequest } from '../../src/types/hearings';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  const { youtube_url, year, committee, bill_name, bill_ids, video_title, hearing_date, room, ampm } = req.body;

  const validatedHearingDate = hearing_date || new Date().toISOString().split('T')[0];
  const hasCommittee = Array.isArray(committee) ? committee.length > 0 : !!committee;
  if (!youtube_url || !year || !hasCommittee || !bill_name || !video_title) {
    console.log('Validation failed:', { youtube_url: !!youtube_url, year: !!year, hasCommittee, bill_name: !!bill_name, video_title: !!video_title });

    return res.status(400).json({ error: 'Missing required fields', required: ['youtube_url','year','committee','bill_name','video_title','hearing_date'], received: { youtube_url, year, committee, bill_name, video_title, hearing_date } });
  }

  try {
    const requestPayload: TranscriptionRequest = { youtube_url, year, committee, bill_name, bill_ids, video_title, hearing_date: validatedHearingDate, room, ampm };
    const resp = await postTranscribe(requestPayload);

    if (!resp) return res.status(202).json({ status: 'queued', message: 'Job queued' });
    const respObj = resp as unknown as Record<string, unknown>;
    if (respObj.status === 'queued') {
      return res.status(202).json({ status: String(respObj.status), folder_path: respObj.folder_path ? String(respObj.folder_path) : undefined, message: String(respObj.message ?? 'Job queued') });
    }

    if ('transcript' in respObj && respObj.transcript) {
      const formatted = formatTranscriptResponse(resp as PythonAPIResponse);
      return res.json(formatted);
    }

    return res.json(respObj);
  } catch (error: any) {
    console.error('Error during transcription:', error);
    if (error.response) {
      return res.status(error.response?.status || 500).json({ error: 'Transcription failed', details: error.response?.data?.details || error.message });
    }
    return res.status(500).json({ error: 'Failed to transcribe video', details: error.message || 'Unknown error' });
  }
});

export default router;
