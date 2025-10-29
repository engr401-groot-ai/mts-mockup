import type {
  TranscriptListItem,
  ClientResponse,
  TranscriptionRequest,
} from '../types/hearings';

const APP_API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export type Keyterm = { category: string; term: string; aliases: string[] };

export async function fetchTranscripts(): Promise<TranscriptListItem[]> {
  try {
    const res = await fetch(`${APP_API_BASE}/list-transcripts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.transcripts || [];
  } catch (err) {
    console.error('fetchTranscripts error:', err);
    return [];
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

    if (data && data.transcript && data.metadata) {
      const transcript = data.transcript || {};

      const formatted = {
        transcription: (transcript.segments || []).map((seg: any) => ({
          transcript: seg.text || '',
          words: (seg.words || []).map((w: any) => ({ word: w.word, startTime: w.start, endTime: w.end }))
        })),
        fullText: transcript.text || '',
        youtube_url: data.metadata?.youtube_url || data.metadata?.youtubeUrl || '',
        segments: transcript.segments || [],
        folderPath: data.folder_path || data.folderPath || (data.metadata && data.metadata.folder_path) || '',
        metadataPath: data.metadata_path || data.metadataPath,
        transcriptPath: data.transcript_path || data.transcriptPath,
        cached: data.cached || false,
        metadata: data.metadata || {},
        transcriptInfo: {
          model: transcript.model,
          processing_time: transcript.processing_time,
          total_segments: transcript.total_segments,
          language: transcript.language,
        }
      } as ClientResponse;

      return formatted;
    }
    return data as ClientResponse;
  } catch (err) {
    console.error('fetchTranscript error:', err);
    return null;
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

export async function fetchKeyterms(): Promise<Keyterm[]> {
  try {
    const res = await fetch(`${APP_API_BASE}/sheet`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as Keyterm[];
  } catch (err) {
    console.error('fetchKeyterms error:', err);
    return [];
  }
}

export async function fetchMentions(year: string, committee: string, billName: string, videoTitle: string) {
  try {
    const res = await fetch(`${APP_API_BASE}/mentions/${year}/${committee}/${billName}/${videoTitle}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data as { mentions: any[] } | null;
  } catch (err) {
    console.error('fetchMentions error:', err);
    return null;
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
