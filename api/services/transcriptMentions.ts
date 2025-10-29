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
  matchType: 'explicit' | 'implicit';
}

/**
 * Creates a unique ID for a mention
 */
function makeId(term: string, segmentId: number, timestamp: number): string {
  return `${term.replace(/\s+/g, '_').slice(0, 40)}-${segmentId}-${Math.floor(timestamp)}`;
}

/**
 * Normalize text: remove diacritics, lowercase, trim
 */
function norm(s = ''): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a term is too generic to match alone
 */
function isGenericTerm(termNorm: string): boolean {
  const generic = [
    'university', 'college', 'research', 'board',
    'center', 'education', 'athletic', 'scholarship', 'tuition'
  ];

  const tokens = termNorm.split(/\s+/).filter(Boolean);

  // Single generic words are too generic
  if (tokens.length === 1 && generic.includes(tokens[0])) {
    return true;
  }

  return false;
}

/**
 * STRATEGY 1: Pure Regex Matching
 * 
 * Your keyterms from CSV:
 * - legislation: "304a", "302a-431", "487n"
 * - organization: "Board of Regents" (BOR), "RCUH", "JABSOM", etc.
 * - education: "university" (UH), "community college" (cc)
 * - location: "Mauna Kea", "Aloha Stadium"
 * - issue: "Red Hill", "Underground Storage Tanks"
 * - category: "Athletic"
 * 
 * Approach:
 * 1. Normalize both term and segment text
 * 2. Try exact phrase match with word boundaries
 * 3. Try flexible whitespace if multi-word term
 * 4. Extract matched text preserving original case
 */
function findExplicitMatches(terms: Term[], segments: Segment[]): Mention[] {
  const mentions: Mention[] = [];

  if (!terms?.length || !segments?.length) return mentions;

  // Process each term and its aliases
  for (const term of terms) {
    const variants = [term.text, ...(term.aliases || [])];

    for (const variantRaw of variants) {
      const variant = String(variantRaw || '').trim();
      if (!variant) continue;

      const variantNorm = norm(variant);

      // Skip generic single-word terms
      if (isGenericTerm(variantNorm)) continue;

      const variantTokens = variantNorm.split(/\s+/).filter(Boolean);
      if (!variantTokens.length) continue;

      // Check each segment for this variant
      for (const seg of segments) {
        const segNorm = norm(seg.text);

        // PHASE 1: Exact phrase match with word boundaries
        // Using Unicode word boundaries (handles numbers and letters)
        const exactPattern = new RegExp(
          `(?<!\\p{L}|\\p{N})${escapeRegex(variantNorm)}(?!\\p{L}|\\p{N})`,
          'u'
        );

        const exactMatch = exactPattern.exec(segNorm);

        if (exactMatch) {
          // Extract matched text from original segment (preserving case/diacritics)
          const matchStart = exactMatch.index;
          const matchEnd = matchStart + exactMatch[0].length;
          const matchedText = seg.text.slice(matchStart, matchEnd);

          mentions.push({
            id: makeId(term.text, seg.id, seg.start),
            termId: term.id || term.text,
            term: term.text,
            matchedText: matchedText,
            segmentId: seg.id,
            timestamp: seg.start,
            score: 1.0, // Perfect match
            matchType: 'explicit'
          });
          continue; // Found match, move to next segment
        }

        // PHASE 2: Flexible whitespace for multi-word terms
        // Handles: "board  of  regents", "board\nof regents", etc.
        if (variantTokens.length > 1) {
          const flexPattern = variantTokens
            .map(t => escapeRegex(t))
            .join('\\s+');

          const flexRegex = new RegExp(
            `(?<!\\p{L}|\\p{N})${flexPattern}(?!\\p{L}|\\p{N})`,
            'u'
          );

          const flexMatch = flexRegex.exec(segNorm);

          if (flexMatch) {
            const matchStart = flexMatch.index;
            const matchEnd = matchStart + flexMatch[0].length;
            const matchedText = seg.text.slice(matchStart, matchEnd);

            mentions.push({
              id: makeId(term.text, seg.id, seg.start),
              termId: term.id || term.text,
              term: term.text,
              matchedText: matchedText,
              segmentId: seg.id,
              timestamp: seg.start,
              score: 0.95, // Slight penalty for whitespace variation
              matchType: 'explicit'
            });
          }
        }
      }
    }
  }

  return mentions;
}

/**
 * Simple in-memory cache for embeddings
 */
const embeddingsCache = new Map<string, number[]>();

async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(t => norm(t));
  const unique = Array.from(new Set(normalized));

  const missing = unique.filter(u => !embeddingsCache.has(u));
  if (missing.length > 0) {
    const fetched = await getEmbeddings(missing);
    for (let i = 0; i < missing.length; i++) {
      embeddingsCache.set(missing[i], fetched[i]);
    }
  }

  return normalized.map(n => embeddingsCache.get(n) as number[]);
}

/**
 * Cosine similarity between two vectors
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
 * STRATEGY 2: Implicit matches using embeddings
 * 
 * For contextual references that can't be caught by exact matching:
 * - issue: "Red Hill", "Underground Storage Tanks"
 * - location: "Mauna Kea", "Aloha Stadium"
 */
async function findImplicitMatches(
  terms: Term[],
  segments: Segment[],
  alreadyMatched: Set<string>,
  threshold = 0.75,
  topKPerTerm = 3
): Promise<Mention[]> {
  // Only use embeddings for specific categories
  const implicitTerms = terms.filter(t => 
    t.category === 'issue' || 
    t.category === 'location' ||
    t.category === 'metonymy'
  );

  const unmatchedSegments = segments.filter(s => 
    !alreadyMatched.has(`${s.id}`)
  );

  if (implicitTerms.length === 0 || unmatchedSegments.length === 0) {
    return [];
  }

  console.log(`   Semantic matching ${implicitTerms.length} terms against ${unmatchedSegments.length} segments...`);

  const termTexts = implicitTerms.map(t => t.text);
  const segmentTexts = unmatchedSegments.map(s => s.text);

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
        termId: implicitTerms[ti].id || implicitTerms[ti].text,
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
 * Deduplicate mentions: prefer explicit > implicit
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

    const priority = { explicit: 2, implicit: 1 };
    const mPriority = priority[m.matchType];
    const ePriority = priority[existing.matchType];

    if (mPriority > ePriority || 
        (mPriority === ePriority && m.score > existing.score)) {
      map.set(key, m);
    }
  }

  const priority = { explicit: 2, implicit: 1 };
  return Array.from(map.values()).sort((a, b) => {
    const diff = priority[b.matchType] - priority[a.matchType];
    return diff !== 0 ? diff : b.score - a.score;
  });
}

/**
 * Main function
 */
export async function findMentions(
  terms: Term[],
  segments: Segment[],
  options = {
    useExplicit: true,
    useImplicit: false,
    implicitThreshold: 0.75
  }
): Promise<Mention[]> {
  const allMentions: Mention[] = [];
  const matchedSegments = new Set<string>();

  // Normalize terms from Google Sheets API
  const normalizedTerms: Term[] = (terms || []).map((t: any) => ({
    id: t.id || t.text || undefined,
    text: String(t.text || t.term || '').trim(),
    aliases: Array.isArray(t.aliases)
      ? t.aliases
      : typeof t.aliases === 'string'
        ? t.aliases.split(/[;,]/).map((a: string) => a.trim()).filter(Boolean)
        : [],
    category: t.category || undefined,
    isExplicit: typeof t.isExplicit === 'boolean' ? t.isExplicit : undefined,
  })).filter(t => t.text); // Remove empty terms

  console.log(`\nProcessing ${normalizedTerms.length} terms against ${segments.length} segments...`);

  // Phase 1: Explicit regex matching
  if (options.useExplicit) {
    console.log('\n[1/2] Finding explicit matches...');
    const explicitStart = Date.now();
    const explicit = findExplicitMatches(normalizedTerms, segments);
    console.log(`   Found ${explicit.length} explicit mentions in ${Date.now() - explicitStart}ms`);

    allMentions.push(...explicit);
    explicit.forEach(m => matchedSegments.add(`${m.segmentId}`));
  }

  // Phase 2: Implicit semantic matching
  if (options.useImplicit) {
    console.log('\n[2/2] Finding implicit matches...');
    const implicitStart = Date.now();
    const implicit = await findImplicitMatches(
      normalizedTerms,
      segments,
      matchedSegments,
      options.implicitThreshold
    );
    console.log(`   Found ${implicit.length} implicit mentions in ${Date.now() - implicitStart}ms`);

    allMentions.push(...implicit);
  }

  const deduped = deduplicateMentions(allMentions);
  console.log(`\n✓ Total unique mentions: ${deduped.length}`);

  return deduped;
}

export default { findMentions };