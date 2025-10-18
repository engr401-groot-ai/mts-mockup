import React, { useRef, useEffect, useMemo, useState } from 'react';
import TranscriptDownload from './TranscriptDownload';

interface TranscriptSegment {
    id: number,
    start: number,
    end: number,
    text: string,
}

interface TranscriptProps {
    segments: TranscriptSegment[];
    onTimestampClick: (startTime: number) => void;
    currentTime?: number;
    searchTerm?: string;
    currentSearchIndex?: number;
    onSearchResultsChange?: (results: { total: number; matches: Array<{ segmentId: number; matchIndex: number }> }) => void;
    onDownload?: () => void;
}

const TranscriptDisplay: React.FC<TranscriptProps> = ({
    segments,
    onTimestampClick,
    currentTime = 0,
    searchTerm = '',
    currentSearchIndex = 0,
    onSearchResultsChange,
    onDownload,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'fullText' | 'mentions'>('fullText');

    // Calculate all search matches
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

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

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
            {/* Header with Download */}
            {onDownload && (
                <div className="p-4 border-b">
                    <TranscriptDownload 
                        onDownload={onDownload}
                        segmentCount={segments.length}
                    />
                </div>
            )}
            
            {/* Tabs */}
            <div className="border-b">
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
            </div>
            
            {/* Tab Content */}
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
                                {formatTime(segment.start)}
                            </button>
                            <p className="text-gray-800 leading-relaxed">
                                {highlightText(segment.text, segment.id)}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <p className="text-gray-500 mb-2">TODO: Implicit and Explicit Mentions</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TranscriptDisplay;
