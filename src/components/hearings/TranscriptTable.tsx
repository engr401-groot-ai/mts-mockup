import React from 'react';
import { Link } from 'react-router-dom';
import type { TranscriptListItem } from '../../types/hearings';
import { formatDateTime, formatDuration } from '../../lib/formatUtils';
import { committeeToSlug } from '../../lib/transcriptUtils';

interface TranscriptTableProps {
    transcripts: TranscriptListItem[];
}


/**
 * TranscriptTable
 *
 * Simple tabular list of transcripts used where a compact, sortable view
 * is preferred over the hierarchical tree view.
 */
const TranscriptTable: React.FC<TranscriptTableProps> = ({ transcripts }) => {
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
                                {Array.isArray(transcript.committee) ? (
                                    <div className="flex flex-wrap gap-2">
                                        {transcript.committee.map((c, i) => (
                                            <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded-full border">{c}</span>
                                        ))}
                                    </div>
                                ) : (
                                    transcript.committee
                                )}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono">
                                {transcript.bill_name}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatDateTime(transcript.date)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                {formatDuration(transcript.duration)}
                            </td>
                            <td className="px-4 py-3">
                                <Link
                                    to={`/hearing/${transcript.year}/${committeeToSlug(transcript.committee)}/${transcript.bill_name}/${transcript.video_title}`}
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
