import React from 'react';

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
}

const TranscriptDisplay: React.FC<TranscriptProps> = ({
    segments,
    onTimestampClick,
    currentTime = 0,
    searchTerm = '',
}) => {
    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const highlightText = (text: string, searchTerm: string): React.ReactNode => {
        if (!searchTerm) return text;

        const lowerText = text.toLowerCase();
        const lowerSearchTerm = searchTerm.toLowerCase();

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let currentIndex = lowerText.indexOf(lowerSearchTerm, lastIndex);

        while (currentIndex !== -1) {
            if (currentIndex > lastIndex) {
                parts.push(text.slice(lastIndex, currentIndex));
            }

            parts.push(
                <mark key={`highlight-${currentIndex}`} className="bg-yellow-200 px-1 rounded">
                    {text.slice(currentIndex, currentIndex + searchTerm.length)}
                </mark>
            );

            lastIndex = currentIndex + searchTerm.length;
            currentIndex = lowerText.indexOf(lowerSearchTerm, lastIndex);
        }

        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts;
    }

    const isCurrentSegment = (start: number, end: number): boolean => {
        return currentTime >= start && currentTime <= end;
    }

    if (!segments || segments.length === 0) {
        return (
            <div className="p-4">
                <p className="text-gray-500">No transcript available.</p>
            </div>
        )
    }

    return (
        <div className="h-96 overflow-y-auto space-y-2 p-4">
            {segments.map((segment) => (
                <div
                    key={segment.id}
                    className={`flex gap-3 rounded-lg transition-colors ${
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
                        {highlightText(segment.text, searchTerm)}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default TranscriptDisplay;
