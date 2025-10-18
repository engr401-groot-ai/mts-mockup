import React from 'react';
import { Link } from 'react-router-dom';
import type { TranscriptListItem } from '../../types/hearings';

interface TranscriptTableProps {
    transcripts: TranscriptListItem[];
}

const TranscriptTable: React.FC<TranscriptTableProps> = ({ transcripts }) => {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    if (transcripts.length === 0) {
        return null;
    }

    return (
        <div className="bg-white border rounded">
            <table className="w-full">
                <thead className="bg-gray-100 border-b">
                    <tr>
                        <th className="px-4 py-3 text-left">Title</th>
                        <th className="px-4 py-3 text-left">Committee</th>
                        <th className="px-4 py-3 text-left">Bill</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Duration</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {transcripts.map((transcript, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">
                                {transcript.title}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {transcript.committee}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono">
                                {transcript.bill_name}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatDate(transcript.date)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatDuration(transcript.duration)}
                            </td>
                            <td className="px-4 py-3">
                                <Link
                                    to={`/hearing2/${transcript.year}/${transcript.committee}/${transcript.bill_name}/${transcript.video_title}`}
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
