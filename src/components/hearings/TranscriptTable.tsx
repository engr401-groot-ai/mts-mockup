import React from 'react';
import { Link } from 'react-router-dom';

interface Transcript {
    filename: string;
    hearing_id: string;
    size: number;
    created: string | null;
    gcs_path: string;
}

interface TranscriptTableProps {
    transcripts: Transcript[];
}

const TranscriptTable: React.FC<TranscriptTableProps> = ({ transcripts }) => {
    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatSize = (bytes: number) => {
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(2)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
    };

    if (transcripts.length === 0) {
        return null;
    }

    return (
        <div className="bg-white border rounded">
            <table className="w-full">
                <thead className="bg-gray-100 border-b">
                    <tr>
                        <th className="px-4 py-3 text-left">Hearing ID</th>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Size</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {transcripts.map((transcript, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-sm">
                                {transcript.hearing_id}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatDate(transcript.created)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatSize(transcript.size)}
                            </td>
                            <td className="px-4 py-3">
                                <Link
                                    to={`/hearing/${transcript.hearing_id}`}
                                    className="text-blue-600 hover:underline text-sm"
                                >
                                    View Transcript
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default TranscriptTable;
