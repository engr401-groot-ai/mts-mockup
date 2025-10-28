/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import { listTranscripts, getTranscriptByFolder } from '../services/pythonProxy';
import { formatTranscriptResponse } from '../services/transcriptFormatter';
import type { Request, Response } from 'express';
import { Metadata } from '../../src/types/hearings';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await listTranscripts();
    const formattedTranscripts = (data.transcripts || []).map((t: Metadata) => ({
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

    res.json({ transcripts: formattedTranscripts, count: data.count });
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

router.get('/:year/:committee/:billName/:videoTitle', async (req: Request, res: Response) => {
  const { year, committee, billName, videoTitle } = req.params;
  const normalizeCommittee = (c: string | undefined) => {
    if (!c) return 'UNKNOWN';
    const parts = String(c).split(/[,-]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return 'UNKNOWN';
    return parts.map(p => p.replace(/\s+/g, '').toUpperCase()).join('-');
  };

  const committeeSlug = normalizeCommittee(committee);
  const folderPath = `${year}/${committeeSlug}/${billName}/${videoTitle}`;
  const encoded = encodeURI(folderPath);

  try {
    const data = await getTranscriptByFolder(encoded);
    const formatted = formatTranscriptResponse(data as any);
    res.json(formatted);
  } catch (error: any) {
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Transcript not found' });
    } else {
      console.error('Error fetching transcript:', error);
      res.status(500).json({ error: 'Failed to fetch transcript' });
    }
  }
});

export default router;
