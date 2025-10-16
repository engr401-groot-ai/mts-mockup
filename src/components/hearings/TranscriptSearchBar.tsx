import React from 'react';
import { Search, Download } from 'lucide-react';

interface TranscriptSearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onDownload: () => void;
}

const TranscriptSearchBar: React.FC<TranscriptSearchBarProps> = ({
    searchTerm,
    onSearchChange,
    onDownload
}) => {
    return (
        <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search in transcript..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={onDownload}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>
            </div>
        </div>
    );
};

export default TranscriptSearchBar;
