import React from 'react';

interface Word {
    word: string;
    startTime: number;
    endTime: number;
}

interface TranscriptBlock {
    transcript: string;
    words: Word[];
}

interface TranscriptDisplayProps {
    transcription: TranscriptBlock[];
    searchTerm?: string;
    maxHeight?: string;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
    transcription,
    searchTerm = '',
    maxHeight = '600px'
}) => {
    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const highlightText = (text: string) => {
        if (!searchTerm) return text;
        const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === searchTerm.toLowerCase() ? (
                <mark key={i} className="bg-yellow-200 px-1 rounded">{part}</mark>
            ) : part
        );
    };

    if (!transcription || transcription.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">No transcript data available</p>
            </div>
        );
    }

    return (
        <div className="bg-white border rounded-lg shadow-sm">
            <div className="px-6 py-4 bg-gray-50 border-b rounded-t-lg">
                <h2 className="font-bold text-lg">Transcript</h2>
            </div>
            
            <div className="p-6 overflow-y-auto" style={{ maxHeight }}>
                <div className="space-y-6">
                    {transcription.map((block, idx) => (
                        <div key={idx} className="pb-6 border-b last:border-b-0">
                            <p className="text-base leading-relaxed mb-3">
                                {highlightText(block.transcript)}
                            </p>
                            
                            {block.words && block.words.length > 0 && (
                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                    {block.words.slice(0, 10).map((w, widx) => (
                                        <span 
                                            key={widx}
                                            className="inline-flex items-center gap-1 bg-gray-50 px-2 py-1 rounded"
                                        >
                                            <span>{w.word}</span>
                                            <span className="text-gray-400">
                                                {formatTime(w.startTime)}
                                            </span>
                                        </span>
                                    ))}
                                    {block.words.length > 10 && (
                                        <span className="text-gray-400 px-2 py-1">
                                            ... +{block.words.length - 10} more words
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TranscriptDisplay;
