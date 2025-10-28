import type {
  TranscriptListItem,
  ClientResponse,
  TranscriptionRequest,
} from '../types/hearings';

const APP_API_BASE = 'http://localhost:3001/api';

export type KeytermRow = Array<string | null>;

export async function fetchTranscripts(): Promise<TranscriptListItem[]> {
  try {
    const res = await fetch(`${APP_API_BASE}/transcripts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.transcripts || [];
  } catch (err) {
    console.error('fetchTranscripts error:', err);
    return [];
  }
}

export async function startTranscription(payload: TranscriptionRequest): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${APP_API_BASE}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.details || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error('startTranscription error:', err);
    throw err;
  }
}

export async function fetchKeyterms(): Promise<KeytermRow[]> {
  try {
    const res = await fetch(`${APP_API_BASE}/sheet`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as KeytermRow[];
  } catch (err) {
    console.error('fetchKeyterms error:', err);
    return [];
  }
}

export async function suggestKeyterm(payload: unknown): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${APP_API_BASE}/sheet/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error('suggestKeyterm error:', err);
    throw err;
  }
}

export async function fetchTranscript(year: string, committee: string, billName: string, videoTitle: string): Promise<ClientResponse | null> {
  try {
    const res = await fetch(`${APP_API_BASE}/transcript/${year}/${committee}/${billName}/${videoTitle}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data as ClientResponse;
  } catch (err) {
    console.error('fetchTranscript error:', err);
    return null;
  }
}
