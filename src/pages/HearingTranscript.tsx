import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/hearings/PageHeader.tsx';
import LoadingState from '../components/hearings/LoadingState.tsx';
import ErrorDisplay from '../components/hearings/ErrorDisplay.tsx';
import MetadataCard from '../components/hearings/MetadataCard.tsx';
import TranscriptSearchBar from '../components/hearings/TranscriptSearchBar.tsx';
import TranscriptDisplay from '../components/hearings/TranscriptDisplay.tsx';
import VideoPlayer, { VideoPlayerRef } from '../components/hearings/VideoPlayer.tsx';
import type { ClientResponse, Segment } from '../types/hearings.ts';

interface SearchResults {
    total: number;
    current: number;
    matches: Array<{ segmentId: number; matchIndex: number }>;
}

const HearingTranscript = () => {
    const { year, committee, billName, videoTitle } = useParams<{ 
        year: string; 
        committee: string; 
        billName: string; 
        videoTitle: string; 
    }>();
    const [transcript, setTranscript] = useState<ClientResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentTime, setCurrentTime] = useState(0);
    const videoPlayerRef = useRef<VideoPlayerRef>(null);
    const [searchResults, setSearchResults] = useState<SearchResults>({ 
        total: 0, 
        current: 0, 
        matches: [] 
    });

    useEffect(() => {
        if (year && committee && billName && videoTitle) {
            fetchTranscript();
        }
    }, [year, committee, billName, videoTitle]);

    const fetchTranscript = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetch(`http://localhost:3001/api/transcript/${year}/${committee}/${billName}/${videoTitle}`);

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('Transcript not found');
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data: ClientResponse = await res.json();
            setTranscript(data);
        } catch (err) {
            console.error('Failed to load transcript:', err);
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
        a.download = `transcript-${year}-${committee}-${billName}-${videoTitle}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleProgress = (progress: { playedSeconds: number }) => {
        setCurrentTime(progress.playedSeconds);
    };

    const handleTimestampClick = (startTime: number) => {
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
            <div className="container">
                <PageHeader 
                    backLink="/hearings"
                    backLabel="Back to Hearings List"
                    title="Loading Transcript..."
                />
                <LoadingState message="Please wait..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="container">
                <PageHeader 
                    backLink="/hearings"
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
        <div className="container">
            <PageHeader 
                backLink="/hearings"
                backLabel="Back to Hearings List"
                title="Hearing Transcript"
                subtitle={`${year} / ${committee} / ${billName} / ${videoTitle}`}
            />

            {transcript?.metadata && (
                <MetadataCard metadata={{
                    id: transcript.metadata.hearing_id,
                    title: transcript.metadata.title,
                    duration: transcript.metadata.duration,
                    model: transcript.transcriptInfo.model,
                    totalSegments: transcript.transcriptInfo.total_segments
                }} />
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
    );
};

export default HearingTranscript;
