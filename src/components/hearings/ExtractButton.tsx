import React, { useState } from 'react';
import { fetchKeyterms, extractMentions } from '../../data/client';
import type { TranscriptSegment } from '../../types/hearings';

interface ExtractButtonProps {
  year?: string;
  committee?: string;
  billName?: string;
  videoTitle?: string;
  segments?: TranscriptSegment[];
  onExtracted?: (mentions: any[]) => void;
  className?: string;
}

const ExtractButton: React.FC<ExtractButtonProps> = ({ year, committee, billName, videoTitle, segments = [], onExtracted, className }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    if (!year || !committee || !billName || !videoTitle) {
      setError('Missing transcript identifiers');
      return;
    }

    try {
      setLoading(true);
      const keyterms = await fetchKeyterms();
      if (!Array.isArray(keyterms) || keyterms.length === 0) {
        setError('No keyterms available');
        return;
      }

      const resp = await extractMentions(year, committee, billName, videoTitle, keyterms, segments || []);
      if (resp && Array.isArray(resp.mentions) && onExtracted) {
        onExtracted(resp.mentions);
      }
    } catch (err: any) {
      console.error('ExtractButton error:', err);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center">
      <button
        onClick={handleClick}
        className={className || 'ml-4 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700'}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Extracting...' : 'Extract'}
      </button>
      {error && <div className="text-xs text-red-500 ml-2">{error}</div>}
    </div>
  );
};

export default ExtractButton;
