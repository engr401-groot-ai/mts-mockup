import { getEmbeddings } from "./openai";

/**
 * api/services/embeddings.ts
 *
 * Utility functions to compute embeddings-based similarity and extract
 * semantic mentions between a list of sheet terms and transcript segments.
 *
 * Exports:
 * - cosineSimilarity(vecA, vecB): number
 * - findMentions(terms, segments, threshold, topKPerTerm): Promise<Mention[]>
 *
 * findMentions batches embedding requests (terms and segments), computes
 * cosine similarity and returns matched mentions above `threshold`.
 */

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    na += vecA[i] * vecA[i];
    nb += vecB[i] * vecB[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type Term = {
  id?: string;
  text: string;
}

export type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
}

export type Mention = {
  id: string;
  termId?: string;
  term: string;
  segmentId: number;
  timestamp: number;
  score: number;
}

function makeId(term: string, segmentId: number, timestamp: number) {
  return `${term.replace(/\s+/g, '_').slice(0,40)}-${segmentId}-${Math.floor(timestamp)}`;
}

export async function findMentions(
  terms: Term[],
  segments: Segment[],
  threshold = 0.75,
  topKPerTerm = 5
): Promise<Mention[]> {
  if (!terms || terms.length === 0 || !segments || segments.length === 0) return [];

  // Embed terms and segments in two batches
  const termTexts = terms.map(t => t.text);
  const segmentTexts = segments.map(s => s.text);

  // compute embeddings in parallel
  const [termEmbeddings, segmentEmbeddings] = await Promise.all([
    getEmbeddings(termTexts),
    getEmbeddings(segmentTexts)
  ]);

  const mentions: Mention[] = [];

  for (let ti = 0; ti < terms.length; ti++) {
    const tEmb = termEmbeddings[ti];
    const scores: { segIdx: number; score: number }[] = [];

    for (let si = 0; si < segmentEmbeddings.length; si++) {
      const sEmb = segmentEmbeddings[si];
      const score = cosineSimilarity(tEmb, sEmb);
      if (score >= threshold) scores.push({ segIdx: si, score });
    }

    // sort desc and take top K
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, topKPerTerm);
    for (const s of top) {
      const seg = segments[s.segIdx];
      const m: Mention = {
        id: makeId(terms[ti].text, seg.id, seg.start),
        termId: terms[ti].id,
        term: terms[ti].text,
        segmentId: seg.id,
        timestamp: seg.start,
        score: Number(s.score.toFixed(4))
      };
      mentions.push(m);
    }
  }

  // dedupe by term+segment keeping highest score
  const map = new Map<string, Mention>();
  for (const m of mentions) {
    const key = `${m.term}|${m.segmentId}`;
    const existing = map.get(key);
    if (!existing || (existing && m.score > existing.score)) map.set(key, m);
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export default { cosineSimilarity, findMentions };

