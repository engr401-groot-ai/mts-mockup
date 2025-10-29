import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import { google } from 'googleapis';

const router = express.Router();

const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', 'utf-8'));

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Terms!A2:C'
    });

    const rows = result.data.values || [];

    const formatted = rows.map(([category, term, aliases]) => ({
      category: category || '',
      term: term || '',
      aliases: aliases
        ? aliases
          .replace(/[,;:"']/g, '')
          .split(/\s+/)
          .map((a: string) => a.trim())
          .filter((a: string) => a.length > 0)
        : []
      }));

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

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Suggestions!A:G',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    res.json({ message: 'Suggestion(s) added successfully', count: rows.length });
  } catch (error) {
    console.error('Error adding suggestion:', error);
    res.status(500).json({ error: 'Failed to add suggestion' });
  }
})

export default router;
