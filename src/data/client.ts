import { Bill, Hearing } from '@/types/legislative';

const API_BASE = '/api';

interface BillsIndex {
  bills: Bill[];
  fetched_at: string;
  source_url: string;
}

interface HearingsIndex {
  hearings: Hearing[];
  fetched_at: string;
  source_url: string;
}

interface BillDetail extends Bill {
  fetched_at: string;
  source_url: string;
  text?: string;
  amendments?: unknown[];
  history?: unknown[];
}

export async function getBills(year: number): Promise<Bill[]> {
  try {
    const response = await fetch(`${API_BASE}/${year}/bills/index.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch bills: ${response.statusText}`);
    }
    const data: BillsIndex = await response.json();
    return data.bills;
  } catch (error) {
    console.error('Error fetching bills:', error);
    return [];
  }
}

export async function getBill(id: string, year: number): Promise<BillDetail | null> {
  try {
    const response = await fetch(`${API_BASE}/${year}/bills/${id}.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch bill ${id}: ${response.statusText}`);
    }
    const data: BillDetail = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching bill ${id}:`, error);
    return null;
  }
}

export async function getHearings(year: number): Promise<Hearing[]> {
  try {
    const response = await fetch(`${API_BASE}/${year}/hearings/index.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch hearings: ${response.statusText}`);
    }
    const data: HearingsIndex = await response.json();
    return data.hearings;
  } catch (error) {
    console.error('Error fetching hearings:', error);
    return [];
  }
}

export function getCurrentSession(): number {
  return new Date().getFullYear();
}

export function getAvailableSessions(): number[] {
  const current = getCurrentSession();
  const sessions = [];
  for (let year = 1999; year <= current; year++) {
    sessions.push(year);
  }
  return sessions.reverse();
}
