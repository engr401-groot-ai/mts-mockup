import React from 'react';
import { Video, Clock } from 'lucide-react';

interface TranscriptMetadata {
    id?: string;
    title: string;
    duration: number;
    model: string;
    totalSegments?: number;
}

interface MetadataCardProps {
    metadata: TranscriptMetadata;
}

const MetadataCard: React.FC<MetadataCardProps> = ({ metadata }) => {
    return (
        <div className="bg-white border rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                        <Video className="w-5 h-5 text-gray-500" />
                        <h2 className="text-xl font-semibold">{metadata.title}</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="w-4 h-4" />
                            <span>Duration: {Math.floor(metadata.duration / 60)} min</span>
                        </div>
                        <div className="text-gray-600">
                            Model: {metadata.model}
                        </div>
                        {metadata.totalSegments && (
                            <div className="text-gray-600">
                                Segments: {metadata.totalSegments}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MetadataCard;
