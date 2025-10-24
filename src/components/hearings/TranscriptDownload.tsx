/**
 * TranscriptDownload
 *
 * UI widget that shows transcript metadata (segment count) and a download
 * action to save the transcript as a text file.
 */
import React from 'react';
import { Download } from 'lucide-react';

interface TranscriptDownloadProps {
    onDownload: () => void;
    segmentCount?: number;
}

const TranscriptDownload: React.FC<TranscriptDownloadProps> = ({ 
    onDownload, 
    segmentCount 
}) => {
    return (
        <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Transcript Details</h3>
            <div className="flex items-center gap-3">
                {segmentCount !== undefined && (
                    <span className="text-sm text-gray-600">
                        {segmentCount} segment{segmentCount !== 1 ? 's' : ''}
                    </span>
                )}
                <button
                    onClick={onDownload}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors text-sm"
                    title="Download transcript as text file"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>
            </div>
        </div>
    );
};

export default TranscriptDownload;
