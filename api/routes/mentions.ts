import express from 'express';
import type { Request, Response } from 'express';
import { uploadJson, getJson } from '../services/gcloud';
import { findMentions, type Term, type Segment, type Mention } from '../services/embeddings';
import { getTermsFromSheet } from '../services/sheets';

const router = express.Router();

function safeKey(folderPath: string) {
  return `mentions/${String(folderPath).replace(/\//g, '__')}.json`;
}

function embeddingsKey(folderPath: string, kind: 'terms' | 'segments') {
  return `embeddings/${String(folderPath).replace(/\//g, '__')}-${kind}.json`;
}

// GET persisted mentions
router.get('/:folderPath', async (req: Request, res: Response) => {
  const folderPath = req.params.folderPath;
  if (!folderPath) return res.status(400).json({ error: 'folderPath required' });
  const gcsPath = safeKey(folderPath);
  try {
    const data = await getJson(gcsPath);
    if (!data) return res.status(404).json({ error: 'Mentions not found' });
    return res.json({ source: 'gcs', mentions: data.mentions || data });
  } catch (error) {
    console.error('Error fetching mentions from GCS:', error);
    return res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// Upload known mentions
router.post('/upload', async (req: Request, res: Response) => {
  const { folderPath, mentions } = req.body as { folderPath?: string; mentions?: unknown };
  if (!folderPath || !mentions) return res.status(400).json({ error: 'folderPath and mentions required' });

  const gcsPath = safeKey(folderPath);
  try {
    const uri = await uploadJson(gcsPath, { mentions, created_at: new Date().toISOString() });
    return res.json({ uploaded: true, uri });
  } catch (error) {
    console.error('Error uploading mentions to GCS:', error);
    return res.status(500).json({ error: 'Failed to upload mentions' });
  }
});

/**
 * POST /api/mentions/generate
 * Body: { folderPath?, segments, terms?, threshold?, topKPerTerm? }
 * - If folderPath provided and mentions exist in GCS, returns cached file
 * - Embeddings are cached per-folder in GCS under embeddings/{folder}-(terms|segments).json
 */
router.post('/generate', async (req: Request, res: Response) => {
  const {
    folderPath,
    segments,
    terms,
    threshold = 0.75,
    topKPerTerm = 5,
  } = req.body as {
    folderPath?: string;
    segments?: Segment[];
    terms?: Term[];
    threshold?: number;
    topKPerTerm?: number;
  };

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: 'segments required' });
  }

  const normalized = folderPath ? String(folderPath) : null;
  const mentionsGcsPath = normalized ? safeKey(normalized) : null;

  try {
    // If persisted mentions exist, return them
    if (mentionsGcsPath) {
      const existing = await getJson(mentionsGcsPath);
      if (existing && existing.mentions) return res.json({ source: 'gcs', mentions: existing.mentions });
    }

    // If terms not supplied, fetch from sheet service
    let effectiveTerms: Term[] | undefined = terms;
    if ((!effectiveTerms || effectiveTerms.length === 0)) {
      try {
        const sheetRows = await getTermsFromSheet();
        // sheetRows: { category, term, aliases[] }
        // Build term list including aliases as additional terms
        effectiveTerms = [];
        for (const r of sheetRows) {
          if (r.term) effectiveTerms.push({ text: r.term });
          if (Array.isArray(r.aliases)) {
            for (const a of r.aliases) {
              if (a && a.trim()) effectiveTerms.push({ text: a.trim() });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch terms from sheet:', err);
      }
    }

    if (!effectiveTerms || effectiveTerms.length === 0) {
      return res.status(400).json({ error: 'terms required (either provide in body or configure spreadsheet)' });
    }

    // embeddings caching: try to reuse embeddings stored in GCS
  let termEmbObj: unknown = null;
  let segEmbObj: unknown = null;
    if (normalized) {
      try {
        termEmbObj = await getJson(embeddingsKey(normalized, 'terms'));
        segEmbObj = await getJson(embeddingsKey(normalized, 'segments'));
      } catch (err) {
        // ignore
      }
    }

    // If either embeddings missing, we'll compute them inside findMentions (it calls OpenAI directly)
    // For now we call findMentions which will compute embeddings for provided texts.
    const mentions: Mention[] = await findMentions(effectiveTerms, segments, threshold, topKPerTerm);

    // persist embeddings and mentions for future reuse
    if (normalized) {
      try {
        // Upload mentions
        await uploadJson(mentionsGcsPath as string, { mentions, created_at: new Date().toISOString(), threshold });
      } catch (err) {
        console.warn('Failed to upload mentions to GCS:', err);
      }
    }

    return res.json({ source: 'generated', mentions });
  } catch (error) {
    console.error('Error generating mentions:', error);
    return res.status(500).json({ error: 'Failed to generate mentions' });
  }
});

export default router;
