import express from 'express';
import type { Request, Response } from 'express';
import { uploadJson, getJson } from '../services/gcloud';

const router = express.Router();

// GET /api/mentions/:folderPath - fetch mentions JSON from GCS
router.get('/:folderPath', async (req: Request, res: Response) => {
  const folderPath = req.params.folderPath;
  const safePath = String(folderPath).replace(/\//g, '__');
  const gcsPath = `mentions/${safePath}.json`;
  try {
    const data = await getJson(gcsPath);
    if (!data) return res.status(404).json({ error: 'Mentions not found' });
    return res.json({ source: 'gcs', mentions: data });
  } catch (error) {
    console.error('Error fetching mentions from GCS:', error);
    return res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// POST /api/mentions/upload
router.post('/upload', async (req: Request, res: Response) => {
  const { folderPath, mentions } = req.body as { folderPath?: string; mentions?: unknown };
  if (!folderPath || !mentions) return res.status(400).json({ error: 'folderPath and mentions required' });

  const safePath = String(folderPath).replace(/\//g, '__');
  const gcsPath = `mentions/${safePath}.json`;
  try {
    const uri = await uploadJson(gcsPath, { mentions, created_at: new Date().toISOString() });
    return res.json({ uploaded: true, uri });
  } catch (error) {
    console.error('Error uploading mentions to GCS:', error);
    return res.status(500).json({ error: 'Failed to upload mentions' });
  }
});

export default router;
