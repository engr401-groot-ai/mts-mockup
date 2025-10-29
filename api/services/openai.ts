/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates embeddings for an array of input strings using OpenAI's embeddings API.
 */
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