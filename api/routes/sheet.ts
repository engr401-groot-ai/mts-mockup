import express from 'express';
import type { Request, Response } from 'express';
import { getTermsFromSheet, appendSuggestions } from '../services/sheets';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const formatted = await getTermsFromSheet();
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});

router.post('/suggest', async (req: Request, res: Response) => {
  const { name, email, category, terms } = req.body;
  if (!name || !email || !category || !terms || !Array.isArray(terms) || terms.length === 0) {
    return res.status(400).json({ error: 'Missing required fields or terms array' });
  }

  try {
    const rows = terms.map(t => [
      new Date().toISOString(),
      name,
      email,
      category,
      t.term,
      t.aliases ? t.aliases.join(', ') : '',
      t.notes || ''
    ]);

    await appendSuggestions(rows);
    res.json({ message: 'Suggestion(s) added successfully', count: rows.length });
  } catch (error) {
    console.error('Error adding suggestion:', error);
    res.status(500).json({ error: 'Failed to add suggestion' });
  }
});

export default router;
