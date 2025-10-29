import express from 'express';
import { uploadJson, getJson } from '../services/gcloud';
import { findMentions } from '../services/transcriptmentions.ts';

const router = express.Router();

// GET cached mentions for a transcript
router.get('/:year/:committee/:billName/:videoTitle', async (req, res) => {
  try {
    const { year, committee, billName, videoTitle } = req.params;
    const folderPath = `${year}/${committee}/${billName}/${videoTitle}`.replace(/ /g, '_');
    const path = `${folderPath}/mentions.json`;
    const data = await getJson(path);
    if (!data) return res.status(404).json({ error: 'Mentions not found' });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/mentions error:', err);
    return res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// POST extracted mentions and cache to GCS (body: { year, committee, billName, videoTitle, terms, segments, options })
router.post('/extract', async (req, res) => {
  try {
    const { year, committee, billName, videoTitle, terms, segments, options } = req.body || {};

    if (!year || !committee || !billName || !videoTitle || !Array.isArray(terms) || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Run mention extraction
    const mentions = await findMentions(terms, segments, options || {});

    // Cache to GCS
    const folderPath = `${year}/${committee}/${billName}/${videoTitle}`.replace(/ /g, '_');
    const path = `${folderPath}/mentions.json`;
    await uploadJson(path, { mentions, generated_at: new Date().toISOString() });

    return res.json({ mentions, gcs_path: `gs://${process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET}/${path}` });
  } catch (err) {
    console.error('POST /api/mentions/extract error:', err);
    return res.status(500).json({ error: 'Failed to extract mentions' });
  }
});

export default router;
