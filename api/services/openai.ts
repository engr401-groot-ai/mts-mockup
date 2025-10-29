/*
 * api/services/openai.ts
 *
 * Lightweight wrapper around the OpenAI SDK for creating text embeddings.
 * Exports:
 * - getEmbeddings(inputs: string[]): Promise<number[][]>
 *
 * Requires environment variable: OPENAI_API_KEY
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getEmbeddings(inputs: string[]): Promise<number[][]> {
  // Return empty array for empty input to simplify callers.
  if (!inputs || inputs.length === 0) return [];

  // Use OpenAI embeddings API (small embedding model for cost/latency tradeoff).
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
  });

  // Map response structure to array of numeric vectors.
  return response.data.map((d: any) => d.embedding as number[]);
}