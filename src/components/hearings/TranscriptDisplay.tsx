import React, { useRef, useEffect, useMemo, useState } from 'react';
import TranscriptDropdown from './TranscriptDropdown';
import KeytermsModal from './KeyTermsModal';
import SuggestTermModal from './SuggestTermModal';
import ExtractButton from './ExtractButton';
import { formatTimestamp } from '../../lib/formatUtils';
import { fetchMentions, fetchKeyterms, extractMentions } from '../../data/client';
import type { TranscriptSegment, SearchMatch } from '../../types/hearings';

interface TranscriptProps {
    segments: TranscriptSegment[];
    onTimestampClick: (startTime: number) => void;
    currentTime?: number;
    searchTerm?: string;
    currentSearchIndex?: number;
    onSearchResultsChange?: (results: { total: number; matches: SearchMatch[] }) => void;
    onDownload?: () => void;
    year?: string;
    committee?: string;
    billName?: string;
    videoTitle?: string;
}

/**
 * TranscriptDisplay
 *
 * Renders the hearing transcript, supports search highlighting, navigation
 * to timestamps, and highlights the segment that corresponds to the current
 * playback time. The component exposes search result counts to the parent
 * via `onSearchResultsChange` and supports downloading via `onDownload`.
 */

const TranscriptDisplay: React.FC<TranscriptProps> = ({
    segments,
    onTimestampClick,
    currentTime = 0,
    searchTerm = '',
    currentSearchIndex = 0,
    onSearchResultsChange,
    onDownload,
    year,
    committee,
    billName,
    videoTitle,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'fullText' | 'mentions'>('fullText');
    const [showKeytermsModal, setShowKeytermsModal] = useState(false);
    const [showSuggestModal, setShowSuggestModal] = useState(false);
    const [mentions, setMentions] = useState<Array<any>>([]);
    const [mentionsLoading, setMentionsLoading] = useState(false);
    // extractLoading is handled inside ExtractButton

    useEffect(() => {
        let mounted = true;
        async function load() {
            if (activeTab !== 'mentions') return;
            if (!year || !committee || !billName || !videoTitle) return;
            setMentionsLoading(true);
            const res = await fetchMentions(year, committee, billName, videoTitle);
            if (!mounted) return;
            setMentionsLoading(false);
            setMentions(res?.mentions || []);
        }
        load();
        return () => { mounted = false; };
    }, [activeTab, year, committee, billName, videoTitle]);

    // Calculate all search matches across all segments
    const searchMatches = useMemo(() => {
        if (!searchTerm || !segments) return [];
        
        const matches: Array<{ segmentId: number; matchIndex: number; segmentText: string; matchPosition: number }> = [];
        let globalIndex = 0;
        
        segments.forEach(segment => {
            const text = segment.text.toLowerCase();
            const search = searchTerm.toLowerCase();
            let position = 0;
            
            while ((position = text.indexOf(search, position)) !== -1) {
                matches.push({
                    segmentId: segment.id,
                    matchIndex: globalIndex,
                    segmentText: segment.text,
                    matchPosition: position
                });
                globalIndex++;
                position += search.length;
            }
        });
        
        return matches;
    }, [searchTerm, segments]);

    // Notify parent of search results
    const previousMatchCountRef = useRef<number>(-1);
    
    useEffect(() => {
        // Only update if the number of matches has actually changed
        if (onSearchResultsChange && searchMatches.length !== previousMatchCountRef.current) {
            previousMatchCountRef.current = searchMatches.length;
            onSearchResultsChange({
                total: searchMatches.length,
                matches: searchMatches.map(m => ({ segmentId: m.segmentId, matchIndex: m.matchIndex }))
            });
        }
    }, [searchMatches, onSearchResultsChange]);

    // Highlight search term in text with proper styling for current match
    const highlightText = (text: string, segmentId: number): React.ReactNode => {
        if (!searchTerm) return text;

        const lowerText = text.toLowerCase();
        const lowerSearchTerm = searchTerm.toLowerCase();
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let segmentMatchCount = 0;

        let currentIndex = lowerText.indexOf(lowerSearchTerm);
        while (currentIndex !== -1) {
            // Add text before match
            if (currentIndex > lastIndex) {
                parts.push(text.slice(lastIndex, currentIndex));
            }

            // Find the global match index for this specific match
            const globalMatchIndex = searchMatches.findIndex(match => 
                match.segmentId === segmentId && match.matchPosition === currentIndex
            );
            
            const isCurrentMatch = globalMatchIndex === currentSearchIndex;

            // Add highlighted match
            parts.push(
                <mark
                    key={`match-${segmentId}-${segmentMatchCount}`}
                    className={`px-1 rounded transition-colors ${
                        isCurrentMatch 
                            ? 'bg-blue-500 text-white shadow-md' 
                            : 'bg-yellow-200'
                    }`}
                    data-search-index={globalMatchIndex}
                >
                    {text.slice(currentIndex, currentIndex + searchTerm.length)}
                </mark>
            );

            lastIndex = currentIndex + searchTerm.length;
            currentIndex = lowerText.indexOf(lowerSearchTerm, lastIndex);
            segmentMatchCount++;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts;
    };

    const isCurrentSegment = (start: number, end: number): boolean => {
        return currentTime >= start && currentTime <= end;
    };

    // Scroll to current search result
    useEffect(() => {
        if (searchTerm && currentSearchIndex >= 0 && containerRef.current) {
            const currentMark = containerRef.current.querySelector(`[data-search-index="${currentSearchIndex}"]`);
            if (currentMark) {
                currentMark.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [currentSearchIndex, searchTerm]);

    if (!segments || segments.length === 0) {
        return (
            <div className="p-4">
                <p className="text-gray-500">No transcript available.</p>
            </div>
        );
    }

    return (
        <>
            {/* Header: transcript details + actions dropdown (right) */}
            <div className="p-4 border-b flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Transcript Details</h3>
                    <div className="text-sm text-gray-600">
                        {segments.length} segment{segments.length !== 1 ? 's' : ''}
                    </div>
                </div>
                {onDownload && (
                    <div className="flex items-center">
                        <TranscriptDropdown
                            onDownload={onDownload}
                            onShowKeyterms={() => setShowKeytermsModal(true)}
                        />
                    </div>
                )}
            </div>
            
            {/* View tabs */}
            <div className="border-b">
                <div className="flex items-center justify-between">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('fullText')}
                            className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                                activeTab === 'fullText'
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            Full Text
                        </button>
                        <button
                            onClick={() => setActiveTab('mentions')}
                            className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                                activeTab === 'mentions'
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            Mentions
                        </button>
                    </div>

                    {/* Legend shown when Mentions tab is active */}
                    {activeTab === 'mentions' && (
                        <div className="pr-4">
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <div className="text-xs text-gray-500">Legend:</div>
                                <div className="inline-flex items-center gap-2">
                                    <span className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800">
                                        Explicit
                                    </span>
                                    <span className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-800">
                                        Implicit
                                    </span>
                                </div>
                                <div>
                                        <ExtractButton
                                            year={year}
                                            committee={committee}
                                            billName={billName}
                                            videoTitle={videoTitle}
                                            segments={segments}
                                            onExtracted={(m) => { if (Array.isArray(m)) setMentions(m); }}
                                            className="ml-4 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                                        />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Tab content */}
            {activeTab === 'fullText' ? (
                <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 p-4">
                    {segments.map((segment) => (
                        <div
                            key={segment.id}
                            className={`flex gap-3 p-2 rounded-lg transition-colors ${
                                isCurrentSegment(segment.start, segment.end)
                                    ? 'bg-blue-100 border-l-4 border-blue-500'
                                    : 'hover:bg-gray-50'
                            }`}
                        >
                            <button
                                onClick={() => onTimestampClick(segment.start)}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-sm whitespace-nowrap font-medium min-w-[3rem] text-left"
                            >
                                {formatTimestamp(segment.start)}
                            </button>
                            <p className="text-gray-800 leading-relaxed">
                                {highlightText(segment.text, segment.id)}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-2 p-4">
                    {mentionsLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center text-gray-500">Loading mentions...</div>
                        </div>
                    ) : (
                        <>
                            {mentions && mentions.length > 0 ? (
                                <div className="space-y-2">
                                    {mentions.map((m, idx) => {
                                        const key = `${m.term}-${m.segmentId}-${idx}`;
                                        const segment = segments.find(s => s.id === m.segmentId as number);

                                        const isExplicit = m.matchType === 'explicit';
                                        const isImplicit = m.matchType === 'implicit';

                                        const termHighlightClass = isExplicit ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

                                        return (
                                            <div key={key} className={`flex gap-3 p-2 rounded-lg transition-colors hover:bg-gray-50`}>
                                                <button
                                                    onClick={() => onTimestampClick(m.timestamp)}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-sm whitespace-nowrap font-medium min-w-[3rem] text-left"
                                                >
                                                    {formatTimestamp(m.timestamp)}
                                                </button>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-sm font-bold">
                                                                <span className={`px-1 rounded ${termHighlightClass}`}>{m.term}</span>
                                                            </div>
                                                            <p className="text-gray-800 leading-relaxed mt-1">
                                                                {segment ? highlightText(segment.text, segment.id) : m.matchedText}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center">
                                        <p className="text-gray-500 mb-2">No mentions found.</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            <KeytermsModal
                open={showKeytermsModal}
                onClose={() => setShowKeytermsModal(false)}
                onOpenSuggest={() => setShowSuggestModal(true)}
            />

            {/* Standalone SuggestTermModal (controlled by this parent). When opened, KeytermsModal will be closed by the handler above. */}
            <SuggestTermModal open={showSuggestModal} onClose={() => setShowSuggestModal(false)} />
        </>
    );
};

export default TranscriptDisplay;
