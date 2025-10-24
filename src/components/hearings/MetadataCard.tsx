import React, { useState, useEffect } from 'react';
import { Video, Clock, Calendar, FileText, Building2, MapPin, Sun, Moon } from 'lucide-react';
import type { Metadata } from '../../types/hearings';
import SuggestTermForm from '../hearings/SuggestTermForm';
import { formatDate, formatDuration } from '../../lib/formatUtils';

interface MetadataCardProps {
    metadata: Metadata;
    fullTextLength?: number;
}

const MetadataCard: React.FC<MetadataCardProps> = ({ metadata, fullTextLength }) => {
    const [activeTab, setActiveTab] = useState<'metadata' | 'terms'>('metadata');
    const [terms, setTerms] = useState<string[]>([]);
    const [termsLoading, setTermsLoading] = useState(false);
    const [termsError, setTermsError] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab !== 'terms') return;
        if (terms.length > 0 || termsLoading) return;

        let mounted = true;
        setTermsLoading(true);
        setTermsError(null);

        (async () => {
            try {
                const res = await fetch('http://localhost:3001/api/sheet');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) {
                    throw new Error('Unexpected sheet response');
                }

                const extracted = data
                    .map((row: any[]) => (Array.isArray(row) ? String(row[1] || '').trim() : ''))
                    .filter((t: string) => t.length > 0);

                if (mounted) setTerms(extracted);
            } catch (err) {
                console.error('Failed to load key terms:', err);
                if (mounted) setTermsError(String(err instanceof Error ? err.message : err));
            } finally {
                if (mounted) setTermsLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [activeTab]);

    return (
        <div className="bg-white border rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    {/* Tab Buttons */}
                    <div className="border-b mb-3">
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('metadata')}
                                className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                                    activeTab === 'metadata'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                Metadata
                            </button>
                            <button
                                onClick={() => setActiveTab('terms')}
                                className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                                    activeTab === 'terms'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                Key Terms
                            </button>
                            {activeTab === 'terms' && (
                                <div className="ml-auto flex items-center pr-6">
                                    <SuggestTermForm />
                                </div>
                            )}
                        </div>
                    </div>

                    {activeTab === 'metadata' && (
                        <div className="flex items-center gap-2 mb-3">
                            <Video className="w-5 h-5 text-gray-500" />
                            <h2 className="text-xl font-semibold">{metadata.title}</h2>
                        </div>
                    )}

                    {/* Tab content */}
                    {activeTab === 'metadata' ? (
                        <>
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
                                    <span className="text-sm">Committee: </span>
                                    <div className="flex items-center gap-2">
                                        {Array.isArray(metadata.committee) ? (
                                            metadata.committee.map((c, i) => (
                                                <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded-full border">{c}</span>
                                            ))
                                        ) : (
                                            <span className="text-sm">{metadata.committee}</span>
                                        )}
                                    </div>
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
                        </>
                    ) : (
                        <div className="p-2">
                            {termsLoading ? (
                                <div className="text-sm text-gray-500 p-2">Loading key terms…</div>
                            ) : termsError ? (
                                <div className="text-sm text-red-500 p-2">Failed to load key terms.</div>
                            ) : (
                                <textarea
                                    readOnly
                                    value={terms.join(', ')}
                                    className="w-full h-40 border rounded p-2 text-sm text-muted resize-none overflow-y-auto"
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MetadataCard;
