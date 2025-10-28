import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/hearings/PageHeader.tsx';
import LoadingState from '../components/hearings/LoadingState.tsx';
import ErrorDisplay from '../components/hearings/ErrorDisplay.tsx';
import MetadataCard from '../components/hearings/MetadataCard.tsx';
import TranscriptSearchBar from '../components/hearings/TranscriptSearchBar.tsx';
import TranscriptDisplay from '../components/hearings/TranscriptDisplay.tsx';
import VideoPlayer, { VideoPlayerRef } from '../components/hearings/VideoPlayer.tsx';
import type { ClientResponse, SearchResults } from '../types/hearings.ts';

/**
 * HearingTranscript Page
 * 
 * Displays a single hearing transcript with synchronized video playback,
 * search functionality, and metadata information. Main analysis page for
 * individual hearing recordings.
 */
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

    const fetchTranscript = useCallback(async () => {
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
    }, [year, committee, billName, videoTitle]);

    useEffect(() => {
        if (year && committee && billName && videoTitle) {
            fetchTranscript();
        }
    }, [fetchTranscript, year, committee, billName, videoTitle]);

    const downloadTranscript = () => {
        if (!transcript?.fullText) {
            console.warn('No transcript text available for download');
            return;
        }
        
        try {
            const blob = new Blob([transcript.fullText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcript-${year}-${committee}-${billName}-${videoTitle}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download transcript:', error);
            toast({
                title: 'Download failed',
                description: 'Failed to download transcript. Please try again.',
                variant: 'destructive',
            });
        }
    };

    const handleProgress = (progress: { playedSeconds: number }) => {
        setCurrentTime(progress.playedSeconds);
    };

    const handleTimestampClick = (startTime: number) => {
        if (videoPlayerRef.current) {
            videoPlayerRef.current.seekTo(startTime);
        }
    }

    const handleSearchResultsChange = useCallback((results: { total: number; matches: Array<{ segmentId: number; matchIndex: number }> }) => {
        setSearchResults(prev => ({
            ...results,
            // Keep current index valid when search results change
            current: results.total > 0 ? Math.min(prev.current || 1, results.total) : 0
        }));
    }, []);

    const handleNextResult = () => {
        setSearchResults(prev => ({
            ...prev,
            // Wrap around to first result when at end
            current: prev.current < prev.total ? prev.current + 1 : 1
        }));
    };

    const handlePrevResult = () => {
        setSearchResults(prev => ({
            ...prev,
            // Wrap around to last result when at beginning
            current: prev.current > 1 ? prev.current - 1 : prev.total
        }));
    };

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        if (!value) {
            // Reset search results when search is cleared
            setSearchResults({ total: 0, current: 0, matches: [] });
        } else {
            // Reset to first result when new search term is entered
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
                title="Transcript Analysis"
                subtitle={`${year} / ${committee} / ${billName} / ${videoTitle}`}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Left Column - Video + Terms */}
                <div className="flex flex-col gap-4 h-[800px]">
                    <div className="bg-white rounded-lg shadow p-4 h-[400px]">
                        {transcript?.youtube_url ? (
                            <VideoPlayer 
                                ref={videoPlayerRef}
                                url={transcript.youtube_url} 
                                onProgress={handleProgress}
                            />
                        ) : (
                            <div className="bg-gray-100 h-full flex items-center justify-center rounded">
                                <p className="text-gray-500">No video available</p>
                            </div>
                        )}
                    </div>
                    
                    {/* Placeholder for read-only terms drawer and summary component */}
                    <div className="bg-white rounded-lg shadow p-4 h-[400px]">
                        <p className="text-gray-500 text-center">TODO: Mentions Summary</p>
                    </div>
                </div>

                {/* Right Column - Search + Transcript */}
                <div className="flex flex-col h-[800px]">
                    <TranscriptSearchBar 
                        searchTerm={searchTerm}
                        onSearchChange={handleSearchChange}
                        searchResults={searchResults.total > 0 ? {
                            total: searchResults.total,
                            current: searchResults.current
                        } : undefined}
                        onNextResult={handleNextResult}
                        onPrevResult={handlePrevResult}
                    />
                    
                    <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
                        {transcript?.segments ? (
                            <TranscriptDisplay 
                                segments={transcript.segments}
                                onTimestampClick={handleTimestampClick}
                                currentTime={currentTime}
                                searchTerm={searchTerm}
                                currentSearchIndex={searchResults.current - 1}
                                onSearchResultsChange={handleSearchResultsChange}
                                onDownload={downloadTranscript}
                            />
                        ) : (
                            <div className="p-4">
                                <p className="text-gray-500">No transcript available.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Metadata Card Footer*/}
            {transcript?.metadata && (
                <div className="mt-6">
                    <MetadataCard 
                        metadata={transcript.metadata} 
                        fullTextLength={transcript.fullText?.length}
                    />
                </div>
            )}
        </div>
    );
};

export default HearingTranscript;
