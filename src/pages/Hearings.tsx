'use client';

import { useState, useEffect } from 'react';
import TranscriptForm from '../components/hearings/TranscriptForm.tsx';
import TranscriptTreeView from '../components/hearings/TranscriptTreeView.tsx';
import EmptyState from '../components/hearings/EmptyState.tsx';
import ErrorDisplay from '../components/hearings/ErrorDisplay.tsx';
import type { TranscriptListItem, TranscriptionRequest } from '../types/hearings.ts';
import { fetchTranscripts, startTranscription } from '../data/client';

/**
 * Hearings Page
 * 
 * Main page for viewing and managing hearing transcripts.
 * Displays list of transcripts in a tree view and provides
 * form for creating new transcriptions.
 */
const Hearings = () => {
    const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const items = await fetchTranscripts();
                setTranscripts(items);
            } catch (err) {
                console.error('Error loading transcripts:', err);
                setError(err instanceof Error ? err.message : 'Failed to load transcripts');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    const handleAddTranscript = async (data: TranscriptionRequest) => {
        try {
            const result = await startTranscription(data);
            try {
                const items = await fetchTranscripts();
                setTranscripts(items);
            } catch (err) {
                console.warn('Failed to refresh transcripts after starting job', err);
            }

            return result;
        } catch (error) {
            console.error('Failed to start transcription:', error);
            setError(error instanceof Error ? error.message : 'Transcription failed');
        }
    };

    if (loading) {
        return (
            <div className="container">
                <h1 className="text-2xl font-bold mb-4">Hearings & Transcripts</h1>
                <p>Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container">
                <div className="mb-6 flex justify-between items-center">
                    <h1 className="text-2xl font-bold">Hearings & Transcripts</h1>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600`}
                    >
                        {showAddForm ? 'Cancel' : '+ Add New Transcript'}
                    </button>
                </div>

                {showAddForm && (
                    <TranscriptForm
                        onSubmit={handleAddTranscript}
                        onCancel={() => setShowAddForm(false)}
                    />
                )}

                <ErrorDisplay
                    message={error}
                    onRetry={fetchTranscripts}
                />
            </div>
        );
    }

    return (
        <div className="container">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-2">Hearings & Transcripts</h1>
                    <p className="text-gray-600">Total: {transcripts.length} transcripts</p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                    {showAddForm ? 'Cancel' : '+ Add New Transcript'}
                </button>
            </div>

            {showAddForm && (
                <TranscriptForm
                    onSubmit={handleAddTranscript}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            {transcripts.length === 0 ? (
                <EmptyState
                    message="No transcripts found"
                    actionLabel="Create First Transcript"
                    onAction={showAddForm ? undefined : () => setShowAddForm(true)}
                />
            ) : (
                <TranscriptTreeView transcripts={transcripts} />
            )}
        </div>
    );
};

export default Hearings;
