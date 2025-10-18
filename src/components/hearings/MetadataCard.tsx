import React from 'react';
import { Video, Clock, Calendar, FileText, Building2, MapPin, Sun, Moon } from 'lucide-react';
import type { Metadata } from '../../types/hearings';

interface MetadataCardProps {
    metadata: Metadata;
    fullTextLength?: number;
}

const MetadataCard: React.FC<MetadataCardProps> = ({ metadata, fullTextLength }) => {
    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    return (
        <div className="bg-white border rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                        <Video className="w-5 h-5 text-gray-500" />
                        <h2 className="text-xl font-semibold">{metadata.title}</h2>
                    </div>
                    
                    {/* Primary Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">{formatDate(metadata.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm">Duration: {formatDuration(metadata.duration)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                            <Building2 className="w-4 h-4" />
                            <span className="text-sm">Committee: {metadata.committee}</span>
                        </div>
                    </div>

                    {/* Secondary Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <FileText className="w-4 h-4" />
                            <span>
                                Bill(s): 
                                {metadata.bill_ids && metadata.bill_ids.length > 0 && (
                                    <span className="text-sm ml-1">
                                        {metadata.bill_ids.join(', ')}
                                    </span>
                                )}
                            </span>
                        </div>
                        
                        {metadata.room && (
                            <div className="flex items-center gap-2 text-gray-600">
                                <MapPin className="w-4 h-4" />
                                <span>Room: {metadata.room}</span>
                            </div>
                        )}
                        
                        {metadata.ampm && (
                            <div className="flex items-center gap-2 text-gray-600">
                                {metadata.ampm.toLowerCase() === 'am' ? (
                                    <Sun className="w-4 h-4" />
                                ) : (
                                    <Moon className="w-4 h-4" />
                                )}
                                <span>{metadata.ampm.toUpperCase()}</span>
                            </div>
                        )}
                    </div>

                    {/* Additional Details */}
                    <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>Hearing ID: {metadata.hearing_id}</span>
                            <span>Year: {metadata.year}</span>
                            <span>Title: {metadata.video_title}</span>
                            {fullTextLength && (
                                <span>Characters: {fullTextLength.toLocaleString()}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MetadataCard;
