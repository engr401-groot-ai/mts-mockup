import React, { useState, useEffect } from 'react';
import MtsNavBar from '../components/MtsNavbar.tsx';
import TranscriptForm2 from '../components/hearings/TranscriptForm2.tsx';
import TranscriptTable2 from '../components/hearings/TranscriptTable2.tsx';
import EmptyState from '../components/hearings/EmptyState.tsx';
import ErrorDisplay from '../components/hearings/ErrorDisplay.tsx';
import type { TranscriptListItem, TranscriptionRequest } from '../types/hearings';

const Hearings2 = () => {
    const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);

    useEffect(() => {
        fetchTranscripts();
    }, []);

    const fetchTranscripts = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const res = await fetch('http://localhost:3001/api/transcripts');
            
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            
            const data = await res.json();
            setTranscripts(data.transcripts || []);
        } catch (err) {
            console.error('Error fetching transcripts:', err);
            setError(err instanceof Error ? err.message : 'Failed to load transcripts');
        } finally {
            setLoading(false);
        }
    };

    const handleAddTranscript = async (data: TranscriptionRequest) => {
        try {
            const res = await fetch('http://localhost:3001/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || errorData.error || `HTTP error! status: ${res.status}`);
            }

            await res.json();

            setShowAddForm(false);
            await fetchTranscripts();
            alert('Transcript created successfully!');
        } catch (error) {
            console.error('Transcription failed:', error);
            throw error;
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold mb-4">Hearings & Transcripts</h1>
                <p>Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <MtsNavBar />
                <div className="mb-6 flex justify-between items-center">
                    <h1 className="text-2xl font-bold">Hearings & Transcripts</h1>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                        {showAddForm ? 'Cancel' : '+ Add New Transcript'}
                    </button>
                </div>

                {showAddForm && (
                    <TranscriptForm2 
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
        <div className="p-8 max-w-6xl mx-auto">
            <MtsNavBar />
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
                <TranscriptForm2 
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
                <TranscriptTable2 transcripts={transcripts} />
            )}
        </div>
    );
};

export default Hearings2;
