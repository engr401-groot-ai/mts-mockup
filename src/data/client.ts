import type {
  TranscriptListItem,
  ClientResponse,
  TranscriptionRequest,
  Keyterm
} from '../types/hearings';

const EXPRESS_BASE = ((import.meta.env.VITE_API_EXPRESS as string | undefined) || '') + '/api';
const PYTHON_BASE = import.meta.env.VITE_API_PYTHON as string | undefined;

export async function fetchTranscripts(): Promise<TranscriptListItem[]> {
  try {
  const res = await fetch(`${PYTHON_BASE}/list-transcripts`);
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
  const res = await fetch(`${PYTHON_BASE}/transcript/${year}/${committee}/${billName}/${videoTitle}`);
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

export async function fetchKeyterms(): Promise<Keyterm[]> {
  try {
    const res = await fetch(`${EXPRESS_BASE}/sheet`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ([]));

    // The sheet route currently returns an array of rows (e.g. [[category, term, aliases], ...])
    const rows: any[] = Array.isArray(data) ? data : data.values || [];

    const formatted: Keyterm[] = rows
      .map((r: any) => {
        if (!r) return null;
        // If row is an object already
        if (typeof r === 'object' && !Array.isArray(r)) {
          return {
            category: (r.category || r.Category) || '',
            term: (r.term || r.Term || '') as string,
            aliases: Array.isArray(r.aliases) ? r.aliases : (typeof r.aliases === 'string' ? r.aliases.split(/[,;\s]+/).map((a: string) => a.trim()).filter(Boolean) : []),
            notes: r.notes || ''
          } as Keyterm;
        }

        // Row is an array: [category, term, aliases]
        const [category, term, aliases] = r;
        const aliasArr = aliases
          ? String(aliases).replace(/[,;:\"']/g, '').split(/\s+/).map((a: string) => a.trim()).filter(Boolean)
          : [];

        return {
          category: category || '',
          term: term || '',
          aliases: aliasArr
        } as Keyterm;
      })
      .filter(Boolean) as Keyterm[];

    return formatted;
  } catch (err) {
    console.error('fetchKeyterms error:', err);
    return [];
  }
}

export async function startTranscription(payload: TranscriptionRequest): Promise<Record<string, unknown>> {
  try {
  const res = await fetch(`${EXPRESS_BASE}/transcribe`, {
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

export async function fetchMentions(year: string, committee: string, billName: string, videoTitle: string) {
  try {
  const res = await fetch(`${EXPRESS_BASE}/mentions/${year}/${committee}/${billName}/${videoTitle}`);
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

export async function suggestKeyterm(payload: {
  name: string;
  email: string;
  category: string;
  terms: Array<{ term: string; aliases?: string[]; notes?: string }>
}): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${EXPRESS_BASE}/sheet/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.details || `HTTP ${res.status}`);
    }
    return data as Record<string, unknown>;
  } catch (err) {
    console.error('suggestKeyterm error:', err);
    throw err;
  }
}

export async function extractMentions(
  year: string,
  committee: string,
  billName: string,
  videoTitle: string,
  terms: unknown,
  segments: unknown,
  options?: unknown
): Promise<{ mentions: any[]; gcs_path?: string } | null> {
  try {
    const payload = { year, committee, billName, videoTitle, terms, segments, options };
  const res = await fetch(`${EXPRESS_BASE}/mentions/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as { mentions: any[]; gcs_path?: string };
  } catch (err) {
    console.error('extractMentions error:', err);
    return null;
  }
}
