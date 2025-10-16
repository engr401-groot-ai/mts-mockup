import React, { useState, useEffect, useRef } from 'react';
import MtsNavBar from '../components/MtsNavbar.tsx';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/hearings/PageHeader';
import LoadingState from '../components/hearings/LoadingState';
import ErrorDisplay from '../components/hearings/ErrorDisplay';
import MetadataCard from '../components/hearings/MetadataCard';
import TranscriptSearchBar from '../components/hearings/TranscriptSearchBar';
import TranscriptDisplay from '../components/hearings/TranscriptDisplay';
import VideoPlayer, { VideoPlayerRef } from '../components/hearings/VideoPlayer';

interface Word {
    word: string;
    startTime: number;
    endTime: number;
}

interface TranscriptBlock {
    transcript: string;
    words: Word[];
}

interface TranscriptSegement {
    id: number;
    start: number;
    end: number;
    text: string;
}

interface TranscriptData {
    transcription: TranscriptBlock[];
    fullText?: string;
    youtube_url?: string;
    segments?: TranscriptSegement[];
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
    const [currentTime, setCurrentTime] = useState(0);
    const videoPlayerRef = useRef<VideoPlayerRef>(null);
    const [searchResults, setSearchResults] = useState<{
        total: number;
        current: number;
        matches: Array<{ segmentId: number; matchIndex: number }>;
    }>({ total: 0, current: 0, matches: [] });

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
            console.log('Transcript data:', data);
            console.log('YouTube URL:', data.youtube_url);
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

    const handleProgress = (progress: { playedSeconds: number }) => {
        setCurrentTime(progress.playedSeconds);
    };

    const handleTimestampClick = (startTime: number) => {
        console.log('Seeking to:', startTime);
        if (videoPlayerRef.current) {
            videoPlayerRef.current.seekTo(startTime);
        }
    }

    const handleSearchResultsChange = (results: { total: number; matches: Array<{ segmentId: number; matchIndex: number }> }) => {
        setSearchResults(prev => ({
            ...results,
            current: results.total > 0 ? Math.min(prev.current || 1, results.total) : 0
        }));
    };

    const handleNextResult = () => {
        setSearchResults(prev => ({
            ...prev,
            current: prev.current < prev.total ? prev.current + 1 : 1
        }));
    };

    const handlePrevResult = () => {
        setSearchResults(prev => ({
            ...prev,
            current: prev.current > 1 ? prev.current - 1 : prev.total
        }));
    };

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        if (!value) {
            setSearchResults({ total: 0, current: 0, matches: [] });
        } else {
            setSearchResults(prev => ({ ...prev, current: 1 }));
        }
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
            <>
                <MtsNavBar />

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
            </>
        );
    }

    return (
        <>
        <div className="p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
            <MtsNavBar />

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
                onSearchChange={handleSearchChange}
                onDownload={downloadTranscript}
                searchResults={searchResults.total > 0 ? {
                    total: searchResults.total,
                    current: searchResults.current
                } : undefined}
                onNextResult={handleNextResult}
                onPrevResult={handlePrevResult}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow p-4">
                        {transcript?.youtube_url ? (
                            <VideoPlayer 
                                ref={videoPlayerRef}
                                url={transcript.youtube_url} 
                                onProgress={handleProgress}
                            />
                        ) : (
                            <div className="bg-gray-100 h-64 flex items-center justify-center rounded">
                                <p className="text-gray-500">No video available</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow">
                        <div className="p-4 border-b">
                            <h3 className="text-lg font-semibold">Transcript Details</h3>
                        </div>
                        
                        {transcript?.segments ? (
                            <TranscriptDisplay 
                                segments={transcript.segments}
                                onTimestampClick={handleTimestampClick}
                                currentTime={currentTime}
                                searchTerm={searchTerm}
                                currentSearchIndex={searchResults.current - 1}
                                onSearchResultsChange={handleSearchResultsChange}
                            />
                        ) : (
                            <div className="p-4">
                                <p className="text-gray-500">No transcript available.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Footer */}
            {transcript?.fullText && (
                <div className="mt-6 text-center text-sm text-gray-500">
                    Total characters: {transcript.fullText.length.toLocaleString()}
                </div>
            )}
        </div>
        </>
    );
};

export default HearingTranscript;
