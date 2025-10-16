import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/hearings/PageHeader';
import LoadingState from '../components/hearings/LoadingState';
import ErrorDisplay from '../components/hearings/ErrorDisplay';
import MetadataCard from '../components/hearings/MetadataCard';
import TranscriptSearchBar from '../components/hearings/TranscriptSearchBar';
import TranscriptDisplay from '../components/hearings/TranscriptDisplay';

interface Word {
    word: string;
    startTime: number;
    endTime: number;
}

interface TranscriptBlock {
    transcript: string;
    words: Word[];
}

interface TranscriptData {
    transcription: TranscriptBlock[];
    fullText?: string;
    metadata?: {
        id: string;
        title: string;
        duration: number;
        model: string;
        totalSegments?: number;
    };
}

const HearingTranscript = () => {
    const { id } = useParams<{ id: string }>();
    const [transcript, setTranscript] = useState<TranscriptData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (id) {
            fetchTranscript();
        }
    }, [id]);

    const fetchTranscript = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetch(`http://localhost:3001/api/transcript/${id}`);

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('Transcript not found');
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            setTranscript(data);
        } catch (err) {
            console.error('Error fetching transcript:', err);
            setError(err instanceof Error ? err.message : 'Failed to load transcript');
        } finally {
            setLoading(false);
        }
    };

    const downloadTranscript = () => {
        if (!transcript?.fullText) return;
        const blob = new Blob([transcript.fullText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <PageHeader 
                    backLink="/hearings-list"
                    backLabel="Back to Hearings List"
                    title="Loading Transcript..."
                />
                <LoadingState message="Please wait..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <PageHeader 
                    backLink="/hearings-list"
                    backLabel="Back to Hearings List"
                    title="Error Loading Transcript"
                />
                <ErrorDisplay 
                    message={error}
                    onRetry={fetchTranscript}
                />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
            <PageHeader 
                backLink="/hearings-list"
                backLabel="Back to Hearings List"
                title="Hearing Transcript"
                subtitle={`ID: ${id}`}
            />

            {transcript?.metadata && (
                <MetadataCard metadata={transcript.metadata} />
            )}

            <TranscriptSearchBar 
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onDownload={downloadTranscript}
            />

            {transcript?.transcription && (
                <TranscriptDisplay 
                    transcription={transcript.transcription}
                    searchTerm={searchTerm}
                />
            )}

            {/* Stats Footer */}
            {transcript?.fullText && (
                <div className="mt-6 text-center text-sm text-gray-500">
                    Total characters: {transcript.fullText.length.toLocaleString()}
                    {searchTerm && (
                        <span className="ml-4">
                            Matches: {(transcript.fullText.match(new RegExp(searchTerm, 'gi')) || []).length}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default HearingTranscript;
