export type Keyterm = {
  category?: string;
  term: string;
  aliases?: string[];
  notes?: string;
};

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
