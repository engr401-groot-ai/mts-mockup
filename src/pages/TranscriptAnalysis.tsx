import React, { useState } from 'react';
import { TranscriptBlock } from '@/lib/youtubeTranscriber';

const TranscriptAnalysis = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [transcript, setTranscript] = useState<TranscriptBlock[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setTranscript([]);

        try {
            // Call your API route - Updated to correct port
            const res = await fetch('http://localhost:3001/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ youtubeUrl }),
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            setTranscript(data.transcription);
        } catch (err) {
            console.error(err);
            setTranscript([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 flex flex-col gap-4 min-h-screen bg-gray-50">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <label htmlFor="youtubeUrl">YouTube URL:</label>
                <input
                    id="youtubeUrl"
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="border rounded p-2 w-full"
                    placeholder="Enter YouTube URL"
                />
                <button
                    type="submit"
                    className="bg-blue-500 text-white p-2 rounded"
                    disabled={loading}
                >
                    {loading ? 'Transcribing...' : 'Get Transcript'}
                </button>
            </form>

            <div className="mt-4 border rounded p-2 h-64 overflow-y-auto bg-white">
                {transcript.map((block, idx) => (
                    <div key={idx} className="mb-2">
                        <strong>{block.transcript}</strong>
                        <div className="text-sm text-gray-600">
                            {block.words.map((w) => `${w.word}[${w.startTime.toFixed(2)}s]`).join(' ')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TranscriptAnalysis;
