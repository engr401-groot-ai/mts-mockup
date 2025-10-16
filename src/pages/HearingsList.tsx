import React, { useState, useEffect } from 'react';
import MtsNavBar from '../components/MtsNavbar.tsx';
import TranscriptForm from '../components/hearings/TranscriptForm';
import TranscriptTable from '../components/hearings/TranscriptTable';
import EmptyState from '../components/hearings/EmptyState';
import ErrorDisplay from '../components/hearings/ErrorDisplay';

interface Transcript {
    filename: string;
    hearing_id: string;
    size: number;
    created: string | null;
    gcs_path: string;
}

const HearingsList = () => {
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
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

    const handleAddTranscript = async (youtubeUrl: string, hearingId: string) => {
        const res = await fetch('http://localhost:3001/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                youtubeUrl,
                hearingId: hearingId || undefined
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        setShowAddForm(false);
        await fetchTranscripts();
        alert('Transcript created successfully!');
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
                <TranscriptTable transcripts={transcripts} />
            )}
        </div>
    );
};

export default HearingsList;
