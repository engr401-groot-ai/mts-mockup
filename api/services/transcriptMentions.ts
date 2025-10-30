import { getEmbeddings } from "./openai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

/**
 * Write detailed matches to a text file for debugging.
 */
async function writeMatchesDebugFile(
  matches: Array<{term: string, seg: number, score: number}>,
  segments: Segment[],
  maxSimilarity: number,
) {
  // sort descending
  const all = matches.slice().sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  lines.push(`Max similarity: ${maxSimilarity.toFixed(6)}`);
  lines.push(`Total matches: ${all.length}`);
  lines.push('');

  for (const m of all) {
    const segObj = segments.find(s => s.id === m.seg as number);
    const snippet = segObj ? String(segObj.text).replace(/\s+/g, ' ').slice(0, 200) : '';
    lines.push(`score: ${m.score.toFixed(6)} | segment id: ${m.seg} | term: "${m.term}" | text: "${snippet}"`);
  }

  const baseDir = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

  const fileName = `matches-debug.txt`;
  const outPath = path.join(baseDir, fileName);

  try {
    await fs.promises.writeFile(outPath, lines.join('\n'), 'utf8');
    // helpful debug log so callers can see exactly where the file landed
    console.log(`Wrote matches file to ${outPath}`);
  } catch (err) {
    console.error('Failed to write matches file', err);
  }
}

/**
 * Create mention ID
 */
function makeId(term: string, segmentId: number, timestamp: number): string {
  return `${term.replace(/\s+/g, '_').slice(0, 40)}-${segmentId}-${Math.floor(timestamp)}`;
}

/**
 * Normalize a string for embedding comparison
 */
function norm(s = ''): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Simple embedding cache
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Batch get embeddings with caching
 */
async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  // Normalize inputs and compute unique normalized keys
  const normalized = texts.map((t) => norm(t));
  const uniqueNormalized = Array.from(new Set(normalized));

  // Determine which normalized keys are missing from cache and pick a representative original text to fetch
  const toFetch: string[] = [];
  const fetchKeys: string[] = [];

  for (const key of uniqueNormalized) {
    if (!embeddingCache.has(key)) {
      const idx = normalized.indexOf(key);
      const sampleText = texts[idx] || key;
      toFetch.push(sampleText);
      fetchKeys.push(key);
    }
  }

  if (toFetch.length > 0) {
    console.log(`   Fetching ${toFetch.length} new embeddings`);
    try {
      const newEmbeddings = await getEmbeddings(toFetch);
      if (!newEmbeddings || !Array.isArray(newEmbeddings)) {
        console.error('batchGetEmbeddings: invalid response from getEmbeddings');
      } else {
        for (let i = 0; i < fetchKeys.length; i++) {
          const k = fetchKeys[i];
          const emb = newEmbeddings[i];
          if (Array.isArray(emb) && emb.length > 0) embeddingCache.set(k, emb);
        }
      }
    } catch (err) {
      console.error('Error fetching embeddings batch:', err);
    }
  }

  // Return embeddings in same order as input, fallback to empty array if not available
  return texts.map((t) => embeddingCache.get(norm(t)) || []);
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  if (vecA.length !== vecB.length) return 0;

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
 * Semantic Search using OpenAI embeddings
 */
async function findSemanticMatches(
  terms: Term[],
  segments: Segment[],
  threshold = 0.375,
  explicitThreshold = 0.45,
): Promise<Mention[]> {
  if (terms.length === 0 || segments.length === 0) return [];

  console.log(`   Searching: ${terms.length} terms vs ${segments.length} segments...`);

  // Use plain term text for embeddings
  const termQueries: string[] = terms.map(t => String(t.text || '').trim());

  // Batch embed all terms and segments
  const [termEmbeddings, segmentEmbeddings] = await Promise.all([
    batchGetEmbeddings(termQueries),
    batchGetEmbeddings(segments.map(s => s.text))
  ]);

  console.log('   All embeddings fetched!');

  // Match all terms vs segments
  const mentions: Mention[] = [];
  let maxSimilarity = 0;
  let allMatches: Array<{term: string, seg: number, score: number}> = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const termEmb = termEmbeddings[i];
    
    if (!termEmb || termEmb.length === 0) {
      console.log(`   No embedding for term: ${term.text}`);
      continue;
    }

    for (let j = 0; j < segments.length; j++) {
      const seg = segments[j];
      const segEmb = segmentEmbeddings[j];
      
      if (!segEmb || segEmb.length === 0) continue;

      const sim = cosineSimilarity(termEmb, segEmb);
      
      // Track max similarity
      maxSimilarity = Math.max(maxSimilarity, sim);

      // Collect every match for later inspection
      allMatches.push({term: term.text, seg: seg.id, score: sim});

      if (sim >= threshold) {
        // Label higher-confidence semantic hits as 'explicit' for priority,
        // but note these are still semantic-only matches (no text exact-match used).
        const matchType = sim >= explicitThreshold ? 'explicit' : 'implicit';
        mentions.push({
          id: makeId(term.text, seg.id, seg.start),
          termId: term.id || term.text,
          term: term.text,
          matchedText: seg.text.slice(0, 150) + "...",
          segmentId: seg.id,
          timestamp: seg.start,
          score: Number(sim.toFixed(4)),
          matchType,
        });
      }
    }
  }

  await writeMatchesDebugFile(allMatches, segments, maxSimilarity).catch(err => 
    console.error('   DEBUG: failed to write matches file', err)
  );
  
  console.log(`   Total Semantic matches found: ${mentions.length}`);
  
  return mentions;
}

/**
 * Deduplicate: prefer explicit > implicit (higher score wins)
 */
function deduplicateMentions(mentions: Mention[]): Mention[] {
  const map = new Map<string, Mention>();
  const priority = { explicit: 2, implicit: 1 };

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

  return Array.from(map.values()).sort((a, b) => {
    const diff = priority[b.matchType] - priority[a.matchType];
    return diff !== 0 ? diff : b.score - a.score;
  });
}

/**
 * Main Function to find mentions in segments
 */
export async function findMentions(
  terms: Term[],
  segments: Segment[],
  options = {
    implicitThreshold: 0.375,
    explicitThreshold: 0.45,
  }
): Promise<Mention[]> {

  // Normalize terms 
  const normalized = (terms || []).map((t: any) => {
      const termText = String(t?.text || t?.term || "").trim();

      const rawAliases = t?.aliases;

      const aliases = Array.isArray(rawAliases)
        ? rawAliases.map((a: any) => String(a).trim()).filter(Boolean)
        : typeof rawAliases === "string"
        ? String(rawAliases)
            .split(/[;,]/)
            .map((a: string) => a.trim())
            .filter(Boolean)
        : [];

      return {
        id: t?.id || termText,
        text: termText,
        aliases,
        category: t?.category || t?.Category || "",
      } as Term;
    })
    .filter((t) => t.text);

  console.log(`\n${normalized.length} terms, ${segments.length} segments`);

  console.log('   Finding semantic matches...');
  const semanticMentions = await findSemanticMatches(
    normalized,
    segments,
    options.implicitThreshold,
    options.explicitThreshold,
  );

  const allMentions = [...semanticMentions];
  const deduped = deduplicateMentions(allMentions);

  console.log(`Total unique mentions: ${deduped.length}\n`);

  return deduped;
}

export default { findMentions };