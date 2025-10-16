import React, { useState } from 'react';

interface TranscriptFormProps {
    onSubmit: (youtubeUrl: string, hearingId: string) => Promise<void>;
    onCancel?: () => void;
}

const TranscriptForm: React.FC<TranscriptFormProps> = ({ onSubmit, onCancel }) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [hearingId, setHearingId] = useState('');
    const [transcribing, setTranscribing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTranscribing(true);

        try {
            await onSubmit(youtubeUrl, hearingId);
            // Clear form on success
            setYoutubeUrl('');
            setHearingId('');
        } catch (err) {
            // Error handling is done in parent
        } finally {
            setTranscribing(false);
        }
    };

    return (
        <div className="bg-white border rounded p-6 mb-6">
            <h2 className="font-bold mb-4">Create New Transcript</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="youtubeUrl" className="block text-sm font-medium mb-2">
                        YouTube URL:
                    </label>
                    <input
                        id="youtubeUrl"
                        type="text"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        className="border rounded px-3 py-2 w-full"
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                    />
                </div>

                <div>
                    <label htmlFor="hearingId" className="block text-sm font-medium mb-2">
                        Hearing ID (optional):
                    </label>
                    <input
                        id="hearingId"
                        type="text"
                        value={hearingId}
                        onChange={(e) => setHearingId(e.target.value)}
                        className="border rounded px-3 py-2 w-full"
                        placeholder="e.g., hearing-2025-01-15"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        type="submit"
                        className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
                        disabled={transcribing}
                    >
                        {transcribing ? 'Transcribing... (DONT REFRESH! This may take several minutes)' : 'Create Transcript'}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300"
                            disabled={transcribing}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default TranscriptForm;
