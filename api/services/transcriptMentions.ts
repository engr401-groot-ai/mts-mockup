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
  return s.normalize('NFKC').toLowerCase().trim();
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

/**
 * Strategy 1. Explicit matches using regex
 * Uses: Direct names, acronyms, aliases
 */

export function findExplicitMatches(terms: Term[], segments: Segment[]): Mention[] {
  const mentions: Mention[] = [];

  const normSegments = segments.map(s => ({ ...s, textNorm: norm(s.text) }));

  for (const term of terms) {
    const variants = [term.text, ...(term.aliases || [])].map(v => norm(v));
    for (const seg of normSegments) {
      for (const variant of variants) {
        const pattern = ` ${variant} `;
        if (seg.textNorm.includes(pattern) || seg.textNorm.startsWith(variant + ' ') || seg.textNorm.endsWith(' ' + variant) || seg.textNorm === variant) {
          mentions.push({
            id: makeId(term.text, seg.id, seg.start),
            termId: term.id,
            term: term.text,
            matchedText: seg.text,
            segmentId: seg.id,
            timestamp: seg.start,
            score: 1.0,
            matchType: 'explicit'
          });
          break;
        }
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
export function findFuzzyMentions(
  terms: Term[],
  segments: Segment[],
  alreadyMatched: Set<string>,
  options = {
    threshold: 0.3,
    distance: 100,
    minMatchCharLength: 3,
    includeScore: true,
  }
): Mention[] {
  const mentions: Mention[] = [];

  const explicitTerms = terms.filter(t => t.isExplicit !== false);

  // Prepare corpus of term variants (normalized) for searching
  const searchCorpus: Array<{ term: Term; variant: string }> = [];
  for (const term of explicitTerms) {
    const variants = [term.text, ...(term.aliases || [])];
    for (const variant of variants) {
      searchCorpus.push({ term, variant: norm(variant) });
    }
  }

  const fuse = new Fuse(searchCorpus, {
    keys: ['variant'],
    ...options
  });

  for (const segment of segments) {
    const segKey = `${segment.id}`;

    if (alreadyMatched.has(segKey)) continue;

  const words = segment.text.split(/\s+/);
  const segTextNorm = norm(segment.text);

    for (let i = 0; i < words.length; i++) {
      const phrases = [
        words[i],
        words.slice(i, i + 2).join(' '),
        words.slice(i, i + 3).join(' ')
      ];

      for (const phrase of phrases) {
        if (phrase.length < 3) continue;

        const results = fuse.search(norm(phrase));

        if (results.length > 0 && results[0].score! < options.threshold) {
          const match = results[0];
          const term = match.item.term;

          mentions.push({
            id: makeId(term.text, segment.id, segment.start),
            termId: term.id,
            term: term.text,
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
export async function findImplicitMentions(
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
export async function findMentions(
  terms: Term[],
  segments: Segment[],
  options = {
    useExplicit: true,
    useFuzzy: true,
    useImplicit: true,
    fuzzyThreshold: 0.3,
    implicitThreshold: 0.75,
  }
): Promise<Mention[]> {
  const allMentions: Mention[] = [];
  const matchedSegmentIds = new Set<string>();

  console.log(`\nProcessing ${terms.length} terms against ${segments.length} segments...`);

  if (options.useExplicit) {
    console.log('\n[1/3] Finding explicit matches...');
    const explicit = findExplicitMatches(terms, segments);

    console.log(`   Found ${explicit.length} explicit mentions.`);

    allMentions.push(...explicit);
    explicit.forEach(m => matchedSegmentIds.add(`${m.segmentId}`));
  }

  if (options.useFuzzy) {
    console.log('\n[2/3] Finding fuzzy matches...');
    const fuzzy = findFuzzyMentions(
      terms,
      segments,
      matchedSegmentIds, 
      {
        threshold: options.fuzzyThreshold,
        distance: 100,
        minMatchCharLength: 3,
        includeScore: true,
      });

      console.log(`   Found ${fuzzy.length} fuzzy mentions.`);

      allMentions.push(...fuzzy);
      fuzzy.forEach(m => matchedSegmentIds.add(`${m.segmentId}`));
  }

  if ((options as any).useImplicit || (options as any).useSemantic) {
    // Accept either key during a short migration window: useImplicit preferred.
    console.log('\n[3/3] Finding implicit mentions...');
    const implicit = await findImplicitMentions(
      terms,
      segments,
      matchedSegmentIds,
      (options as any).implicitThreshold || (options as any).semanticThreshold || 0.75,
    );

    console.log(`   Found ${implicit.length} implicit mentions.`);

    allMentions.push(...implicit);
  }

  const deduped = deduplicateMentions(allMentions);

  console.log(`\nTotal unique mentions: ${deduped.length}\n`);

  return deduped;
}

export default { cosineSimilarity, findMentions };
