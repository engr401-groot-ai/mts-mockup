import type { PythonAPIResponse, ClientResponse } from '../../src/types/hearings';

/**
 * Format the response from the Python transcription service into the client-friendly structure.
 */
export function formatTranscriptResponse(data: PythonAPIResponse): ClientResponse {
  const transcript = data.transcript ?? { segments: [], text: '', model: '', processing_time: 0, total_segments: 0, language: '' };

  return {
    transcription: transcript.segments.map(seg => ({
      transcript: seg.text,
      words: seg.words?.map(w => ({ word: w.word, startTime: w.start, endTime: w.end })) ?? []
    })),
    fullText: transcript.text,
    youtube_url: data.metadata?.youtube_url ?? '',
    segments: transcript.segments,
    folderPath: data.folder_path ?? '',
    cached: data.cached ?? false,
    metadata: data.metadata ?? {},
    transcriptInfo: {
      model: transcript.model,
      processing_time: transcript.processing_time,
      total_segments: transcript.total_segments,
      language: transcript.language
    }
  };
}

export default { formatTranscriptResponse };
