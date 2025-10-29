/**
 * api/services/sheets.ts
 *
 * Helpers to read terms from a Google Sheets 'Terms' sheet and append
 * suggestion rows to a 'Suggestions' sheet. This centralizes all Sheets
 * access for use by routes (mentions, suggestions UI, etc.).
 *
 * Requires env:
 * - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
 * - SPREADSHEET_ID
 */
import fs from 'fs';
import { google } from 'googleapis';

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!credentialsPath) console.warn('Google Application Credentials not found');

const credentials = credentialsPath ? JSON.parse(fs.readFileSync(credentialsPath, 'utf-8')) : undefined;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheetsClient = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
if (!SPREADSHEET_ID) console.warn('Spreadsheet ID not found');

/**
 * Reads Terms!A2:C and returns rows as objects { category, term, aliases[] }
 */
export async function getTermsFromSheet() {
  const result = await sheetsClient.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Terms!A2:C' });

  const rows = result.data.values || [];

  const formatted = rows.map(([category, term, aliases]) => ({
    category: category || '',
    term: term || '',
    aliases: aliases
      ? String(aliases).replace(/[,;:"']/g, '').split(/\s+/).map(a => a.trim()).filter(a => a.length > 0)
      : []
  }));
  return formatted;
}

/**
 * Append suggestion rows to Suggestions!A:G. Expects rows formatted as arrays.
 */
export async function appendSuggestions(rows: (string | number | boolean | null)[][]) {
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Suggestions!A:G',
    valueInputOption: 'RAW',
    requestBody: { values: rows }
  });
}

export default { getTermsFromSheet, appendSuggestions };
