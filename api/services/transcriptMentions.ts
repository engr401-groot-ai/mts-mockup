import { getEmbeddings } from "./openai";

export type Term = {
  id?: string;
  text: string;
  aliases?: string[];
  category?: string;
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

function makeId(term: string, segmentId: number, timestamp: number): string {
  return `${term.replace(/\s+/g, '_').slice(0, 40)}-${segmentId}-${Math.floor(timestamp)}`;
}

function norm(s = ''): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAcronym(text: string): boolean {
  return /^[A-Z]{2,}$/.test(text.trim());
}

function hasContextualSupport(
  term: Term,
  segment: Segment,
  matchIndex: number
): boolean {
  // Only validate generic education terms
  if (term.category !== 'education' || !/(university|college)$/i.test(term.text)) {
    return true;
  }

  // Get surrounding context (50 chars on each side)
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(segment.text.length, matchIndex + (term.text || '').length + 50);
  const context = segment.text.slice(start, end);

  // Look for Hawaii-specific markers
  return /hawaii|manoa|UH|oahu/i.test(context);
}

/**
 * Phase 1: Exact and fuzzy text matching
 */
function findExplicitMatches(terms: Term[], segments: Segment[]): Mention[] {
  const mentions: Mention[] = [];

  for (const term of terms) {
    const variants = [term.text, ...(term.aliases || [])].filter(Boolean);

    for (const variant of variants) {
      const variantTrimmed = String(variant).trim();
      if (!variantTrimmed) continue;

      const isAcro = isAcronym(variantTrimmed);

      for (const seg of segments) {
        const searchText = seg.text || '';

        // Build pattern based on whether it's an acronym. Use case-insensitive for non-acronyms.
        const boundary = '(?<![A-Za-z0-9])';
        const pattern = new RegExp(
          `${boundary}${escapeRegex(variantTrimmed)}(?![A-Za-z0-9])`,
          isAcro ? 'g' : 'gi'
        );

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(searchText)) !== null) {
          const matchIndex = match.index;
          
          // Validate context for generic terms
          if (!hasContextualSupport(term, seg, matchIndex)) {
            continue;
          }

          // Extract original text preserving case
          const matchedText = seg.text.slice(
            matchIndex,
            matchIndex + match[0].length
          );

          mentions.push({
            id: makeId(term.text, seg.id, seg.start),
            termId: term.id || term.text,
            term: term.text,
            matchedText,
            segmentId: seg.id,
            timestamp: seg.start,
            score: 1.0,
            matchType: 'explicit'
          });
        }
      }
    }
  }

  return mentions;
}

/**
 * Simple embedding cache
 */
const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string): Promise<number[]> {
  const key = norm(text);
  if (!embeddingCache.has(key)) {
    const [embedding] = await getEmbeddings([text]);
    embeddingCache.set(key, embedding);
  }
  return embeddingCache.get(key)!;
}

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
 * Phase 2: Semantic matching for specific categories
 */
async function findSemanticMatches(
  terms: Term[],
  segments: Segment[],
  excludeSegmentIds: Set<number>,
  threshold = 0.82
): Promise<Mention[]> {
  
  // Only match against substantial segments
  const candidates = segments.filter(s =>
    !excludeSegmentIds.has(s.id) &&
    s.text.split(/\s+/).length >= 10
  );

  if (terms.length === 0 || candidates.length === 0) {
    return [];
  }

  console.log(`   Semantic: ${terms.length} terms vs ${candidates.length} segments...`);

  const mentions: Mention[] = [];

  for (const term of terms) {
    const termEmb = await getEmbedding(term.text);

    for (const seg of candidates) {
      const segEmb = await getEmbedding(seg.text);
      const sim = cosineSimilarity(termEmb, segEmb);

      if (sim >= threshold) {
        mentions.push({
          id: makeId(term.text, seg.id, seg.start),
          termId: term.id || term.text,
          term: term.text,
          matchedText: seg.text.slice(0, 80) + '...',
          segmentId: seg.id,
          timestamp: seg.start,
          score: Number(sim.toFixed(4)),
          matchType: 'implicit'
        });
      }
    }
  }

  return mentions;
}

/**
 * Deduplicate: prefer explicit > implicit, higher score
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
    const mPri = priority[m.matchType];
    const ePri = priority[existing.matchType];

    if (mPri > ePri || (mPri === ePri && m.score > existing.score)) {
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
 * Main API
 */
export async function findMentions(
  terms: Term[],
  segments: Segment[],
  options = {
    useExplicit: true,
    useImplicit: false,
    implicitCategories: ['issue', 'location'] as string[],
    implicitThreshold: 0.82
  }
): Promise<Mention[]> {
  
  // Normalize terms - handle both 'term' and 'text' field names
  // Debug: show incoming term shape for easier troubleshooting
  try { console.log('Incoming terms sample:', JSON.stringify((terms || [])[0] || {})); } catch (e) { /* ignore */ }

  const normalized = (terms || []).map((t: any) => {
    const termText = String(t?.text || t?.term || '').trim();
    const rawAliases = t?.aliases;
    const aliases = Array.isArray(rawAliases)
      ? rawAliases.map((a: any) => String(a).trim()).filter(Boolean)
      : (typeof rawAliases === 'string'
        ? String(rawAliases).split(/[;,]/).map((a: string) => a.trim()).filter(Boolean)
        : []);

    return {
      id: t?.id || termText,
      text: termText,
      aliases,
      category: t?.category || t?.Category || ''
    } as Term;
  }).filter(t => t.text);

  console.log(`\n🔍 Processing ${normalized.length} terms, ${segments.length} segments`);

  const allMentions: Mention[] = [];
  const matchedSegIds = new Set<number>();

  // Phase 1: Text matching
  if (options.useExplicit) {
    console.log('\n[1/2] Text matching...');
    const t0 = Date.now();
    const explicit = findExplicitMatches(normalized, segments);
    console.log(`   Found ${explicit.length} explicit mentions (${Date.now() - t0}ms)`);
    
    allMentions.push(...explicit);
    explicit.forEach(m => matchedSegIds.add(m.segmentId));
  }

  // Phase 2: Semantic matching
  if (options.useImplicit) {
    const semanticTerms = normalized.filter(t =>
      options.implicitCategories.includes(t.category || '')
    );

    if (semanticTerms.length > 0) {
      console.log('\n[2/2] Semantic matching...');
      const t0 = Date.now();
      const implicit = await findSemanticMatches(
        semanticTerms,
        segments,
        matchedSegIds,
        options.implicitThreshold
      );
      console.log(`   Found ${implicit.length} implicit mentions (${Date.now() - t0}ms)`);
      
      allMentions.push(...implicit);
    }
  }

  const deduped = deduplicateMentions(allMentions);
  console.log(`\n✓ Total: ${deduped.length} unique mentions\n`);

  return deduped;
}

export default { findMentions };