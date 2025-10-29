import Fuse from "fuse.js";
import { getEmbeddings } from "./openai";

export type Term = {
  id?: string;
  text: string;
  aliases?: string[];
  category?: string;
  isExplicit?: boolean;
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
  matchedText: string;
  segmentId: number;
  timestamp: number;
  score: number;
  matchType: 'explicit' | 'fuzzy' | 'implicit';
}

/**
 * Creates a unique ID for a mention based on the term, segment ID, and timestamp.
 */
function makeId(term: string, segmentId: number, timestamp: number) {
  return `${term.replace(/\s+/g, '_').slice(0,40)}-${segmentId}-${Math.floor(timestamp)}`;
}

/**
 * Normalizes a string by normalizing its Unicode, lowercasing, and trimming whitespace.
 */
function norm(s = '') {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Simple in-memory cache for embeddings to avoid redundant calls to OpenAI API.
 * Keyed by normalized text.
 */
const embeddingsCache = new Map<string, number[]>();

async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  // Normalize and deduplicate inputs
  const normalized = texts.map(t => norm(t));
  const unique = Array.from(new Set(normalized));

  const missing = unique.filter(u => !embeddingsCache.has(u));
  if (missing.length > 0) {
    // fetch embeddings in a single batch call
    const fetched = await getEmbeddings(missing);
    for (let i = 0; i < missing.length; i++) {
      embeddingsCache.set(missing[i], fetched[i]);
    }
  }

  // return embeddings in the original order of texts
  return normalized.map(n => embeddingsCache.get(n) as number[]);
}

/**
 * Computes the cosine similarity between two vectors. (Used for embeddings matching.)
 * TODO?: Convert to use vector or ann
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    na += vecA[i] * vecA[i];
    nb += vecB[i] * vecB[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Strategy 1. Explicit matches using regex
 * Uses: Direct names, acronyms, aliases
 */
function findExplicitMatches(terms: Term[], segments: Segment[]): Mention[] {
  const mentions: Mention[] = [];
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const term of terms) {
    const variants = [term.text, ...(term.aliases || [])];

    for (const segment of segments) {
      const segmentNorm = norm(segment.text);
      let matched = false;

      for (const variant of variants) {
        if (matched) break;
        const variantRaw = String(variant || '').trim();
        if (!variantRaw) continue;
        const variantNorm = norm(variantRaw);

        // Helper: detect acronym-like variants (e.g. RCUH, BOR)
        const isAcronym = /^[A-Z0-9]{2,6}$/.test(variantRaw.replace(/[^A-Za-z0-9]/g, '')) || /^[A-Z]{2,6}$/.test(variantRaw);

        // Skip overly-generic single words unless they're acronyms or reasonably long
        const tokens = variantNorm.split(/\s+/).filter(Boolean);
        if (tokens.length === 1 && tokens[0].length < 3 && !isAcronym) continue;

        // For Hawaii-related short phrases, require context (e.g. "university")
        const isHawaiiRelated = tokens.some(t => ['hawaii', 'manoa', 'hilo', 'oahu', 'maui', 'kauai', 'west', 'w oahu', 'west oahu'].includes(t));
        if (isHawaiiRelated && tokens.length < 2 && !isAcronym) {
          if (!/\buniversity\b/i.test(segmentNorm)) continue;
        }

        // Build a Unicode-aware token boundary regex on the normalized text.
        // We match against the normalized segment to ensure diacritics/case-ins
        // don't interfere, but we use \b-like lookarounds for Unicode letters.
        const pattern = new RegExp(`(?<!\\p{L})${escapeRegex(variantNorm)}(?!\\p{L})`, 'u');
        const match = segmentNorm.match(pattern);
        if (!match) continue;

        // Context validation: reject false positives that are preceded by generic
        // organizational phrases which indicate the segment is listing groups.
        const beforeMatch = segmentNorm.slice(Math.max(0, (match.index || 0) - 30), match.index || 0);
        const rejectPatterns = [/\b(county|tax|foundation|chamber|state|federal|dept|department|office|city|committee)\s+(of\s+)?$/i];
        if (rejectPatterns.some(p => p.test(beforeMatch))) continue;

        mentions.push({
          id: makeId(term.text, segment.id, segment.start),
          termId: term.id,
          term: term.text,
          matchedText: match[0],
          segmentId: segment.id,
          timestamp: segment.start,
          score: 1.0,
          matchType: 'explicit'
        });
        matched = true;
      }
    }
  }

  return mentions;
}

/**
 * Strategy 2. Fuzzy matches using Fuse.js
 * Uses: Misspellings, minor variations, errors in transcription
 * Options can be tuned for sensitivity/specificity.
 */
function findFuzzyMentions(
  terms: Term[],
  segments: Segment[],
  alreadyMatched: Set<string>,
  options = {
    threshold: 0.12,
    distance: 50,
    minMatchCharLength: 5,
    includeScore: true,
  }
): Mention[] {
  const mentions: Mention[] = [];

  // Prefer multi-word variants, but include single-word variants if they are
  // acronym-like or reasonably long (to cover codes like '304a' or 'RCUH').
  const explicitTerms = terms.filter(t => t.isExplicit !== false);
  const searchCorpus: Array<{ term: Term; variant: string }> = [];
  for (const term of explicitTerms) {
    const variants = [term.text, ...(term.aliases || [])];
    for (const variant of variants) {
      const vRaw = String(variant || '').trim();
      if (!vRaw) continue;
      const vNorm = norm(vRaw);
      const tokens = vNorm.split(/\s+/).filter(Boolean);
      const isAcronym = /^[A-Z0-9]{2,6}$/.test(vRaw.replace(/[^A-Za-z0-9]/g, '')) || /^[A-Z]{2,6}$/.test(vRaw);
      if (tokens.length >= 2 || tokens[0].length >= 4 || isAcronym) {
        searchCorpus.push({ term, variant: vNorm });
      }
    }
  }

  const fuse = new Fuse(searchCorpus, {
    keys: ['variant'],
    threshold: options.threshold,
    distance: options.distance,
    includeScore: options.includeScore,
    minMatchCharLength: options.minMatchCharLength
  });

  for (const segment of segments) {
    if (alreadyMatched.has(`${segment.id}`)) continue;

    const words = segment.text.split(/\s+/);

    // Use longer phrases (3-5 words)
    for (let i = 0; i < words.length; i++) {
      const phrases = [
        words.slice(i, i + 3).join(' '),
        words.slice(i, i + 4).join(' '),
        words.slice(i, i + 5).join(' ')
      ];

      for (const phrase of phrases) {
        const phraseNorm = norm(phrase);
        if (phraseNorm.length < options.minMatchCharLength) continue;

        const results = fuse.search(phraseNorm);

        if (results.length > 0 && results[0].score! < options.threshold) {
          const match = results[0];

          // Require significant token overlap (at least 66%)
          const phraseTokens = new Set(phraseNorm.split(/\s+/));
          const variantTokens = new Set(match.item.variant.split(/\s+/));
          let overlap = 0;
          for (const t of phraseTokens) if (variantTokens.has(t)) overlap++;
          
          const overlapRatio = overlap / Math.min(phraseTokens.size, variantTokens.size);
          if (overlapRatio < 0.66) continue;

          // Require "university" if Hawaii-related
          if (/hawaii|manoa|hilo/.test(phraseNorm) && !/university/.test(phraseNorm)) {
            continue;
          }

          mentions.push({
            id: makeId(match.item.term.text, segment.id, segment.start),
            termId: match.item.term.id,
            term: match.item.term.text,
            matchedText: phrase,
            segmentId: segment.id,
            timestamp: segment.start,
            score: Number((1 - match.score!).toFixed(4)),
            matchType: 'fuzzy'
          });
          break;
        }
      }
    }
  }

  return mentions;
}

/**
 * Strategy 3: Implicit matches using OpenAI embeddings
 * Uses: Contextual references, implied mentions, related concepts
 * TODO?: Cap number of segments or terms to control cost/latency
 */
async function findImplicitMentions(
  terms: Term[],
  segments: Segment[],
  alreadyMatched: Set<string>,
  threshold = 0.75,
  topKPerTerm = 3
): Promise<Mention[]> {
  let implicitTerms = terms.filter(t => t.category === 'metonymy' || t.isExplicit === false || t.category === 'geo');
  if (implicitTerms.length === 0) {
    implicitTerms = terms;
  }

  const unmatchedSegments = segments.filter(s => !alreadyMatched.has(`${s.id}`));
  if (implicitTerms.length === 0 || unmatchedSegments.length === 0) return [];
  const termTexts = implicitTerms.map(t => t.text);
  const segmentTexts = unmatchedSegments.map(s => s.text);

  // Use caching/batching for embeddings
  const [termEmbeddings, segmentEmbeddings] = await Promise.all([
    batchGetEmbeddings(termTexts),
    batchGetEmbeddings(segmentTexts)
  ]);

  const mentions: Mention[] = [];

  for (let ti = 0; ti < implicitTerms.length; ti++) {
    const tEmb = termEmbeddings[ti];
    const scores: { segIdx: number; score: number }[] = [];

    for (let si = 0; si < segmentEmbeddings.length; si++) {
      const sEmb = segmentEmbeddings[si];
      const score = cosineSimilarity(tEmb, sEmb);
      if (score >= threshold) {
        scores.push({ segIdx: si, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, topKPerTerm);

    for (const s of top) {
      const seg = unmatchedSegments[s.segIdx];
        mentions.push({
          id: makeId(implicitTerms[ti].text, seg.id, seg.start),
          termId: implicitTerms[ti].id,
          term: implicitTerms[ti].text,
          matchedText: seg.text.slice(0, 60) + '...',
          segmentId: seg.id,
          timestamp: seg.start,
          score: Number(s.score.toFixed(4)),
          matchType: 'implicit'
        });
    }
  }
  
  return mentions;
}

/**
 * Helper function to deduplicate mentions
 * Prefers explicit > fuzzy > implicit
 */
function deduplicateMentions(mentions: Mention[]): Mention[] {
  const map = new Map<string, Mention>();

  for (const m of mentions) {
    const key = `${m.term}|${m.segmentId}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, m);
      continue;
    }

  const priority = { 'explicit': 3, 'fuzzy': 2, 'implicit': 1 } as Record<string, number>;
  const mPriority = priority[m.matchType];
  const ePriority = priority[existing.matchType];

    if (mPriority > ePriority || (mPriority === ePriority && m.score > existing.score)) {
      map.set(key, m);
    }
  }

  const priority = { 'explicit': 3, 'fuzzy': 2, 'implicit': 1 } as Record<string, number>;
  return Array.from(map.values()).sort((a, b) => {
    const diff = priority[b.matchType] - priority[a.matchType];
    return diff !== 0 ? diff : b.score - a.score;
  });
}

/**
 * Main function to find mentions using all strategies.
 */
const DEFAULT_FUZZY_THRESHOLD = 0.2;
const DEFAULT_IMPLICIT_THRESHOLD = 0.75;

export async function findMentions(
  terms: Term[],
  segments: Segment[]
): Promise<Mention[]> {
  const allMentions: Mention[] = [];
  const matchedSegmentIds = new Set<string>();

  const normalizedTerms: Term[] = (terms || []).map((t: any) => ({
    id: t.id || t.term || t.text || undefined,
    text: (t.text && String(t.text)) || (t.term && String(t.term)) || '',
    aliases: Array.isArray(t.aliases) ? t.aliases : (typeof t.aliases === 'string' ? t.aliases.split(/[,;\s]+/).map((a: string)=>a.trim()).filter(Boolean) : (t.aliases ? [String(t.aliases)] : [])),
    category: t.category || undefined,
    isExplicit: typeof t.isExplicit === 'boolean' ? t.isExplicit : undefined,
  }));

  console.log(`\nProcessing ${normalizedTerms.length} terms against ${segments.length} segments...`);

  console.log('\n[1/3] Finding explicit matches...');
  const explicit = findExplicitMatches(normalizedTerms, segments);
  console.log(`   Found ${explicit.length} explicit mentions.`);
  allMentions.push(...explicit);
  explicit.forEach(m => matchedSegmentIds.add(`${m.segmentId}`));

  console.log('\n[2/3] Finding fuzzy matches...');
  const fuzzy = findFuzzyMentions(
    normalizedTerms,
    segments,
    matchedSegmentIds,
    {
      threshold: DEFAULT_FUZZY_THRESHOLD,
      distance: 50,
      minMatchCharLength: 5,
      includeScore: true,
    }
  );
  console.log(`   Found ${fuzzy.length} fuzzy mentions.`);
  allMentions.push(...fuzzy);
  fuzzy.forEach(m => matchedSegmentIds.add(`${m.segmentId}`));

  console.log('\n[3/3] Finding implicit mentions...');
  /*
  const implicit = await findImplicitMentions(
    normalizedTerms,
    segments,
    matchedSegmentIds,
    DEFAULT_IMPLICIT_THRESHOLD,
  );
  console.log(`   Found ${implicit.length} implicit mentions.`);
  allMentions.push(...implicit);
  */

  const deduped = deduplicateMentions(allMentions);

  console.log(`\nTotal unique mentions: ${deduped.length}\n`);

  return deduped;
}

export default { findMentions };
