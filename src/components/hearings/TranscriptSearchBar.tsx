import React from 'react';
import { Search, Download, ChevronUp, ChevronDown } from 'lucide-react';

interface TranscriptSearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onDownload: () => void;
    searchResults?: {
        total: number;
        current: number;
    };
    onNextResult?: () => void;
    onPrevResult?: () => void;
}

const TranscriptSearchBar: React.FC<TranscriptSearchBarProps> = ({
    searchTerm,
    onSearchChange,
    onDownload,
    searchResults,
    onNextResult,
    onPrevResult,
}) => {
    return (
        <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
            <div className="flex gap-4 items-center">
                {/* Search Input Section */}
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search in transcript..."
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Search Navigation Controls - Always visible */}
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border">
                    {searchTerm && searchResults && searchResults.total > 0 ? (
                        <>
                            <span className="text-xs text-gray-600 whitespace-nowrap font-medium">
                                {searchResults.current} of {searchResults.total}
                            </span>
                            <button
                                onClick={onPrevResult}
                                disabled={searchResults.current <= 1}
                                className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Previous result"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onNextResult}
                                disabled={searchResults.current >= searchResults.total}
                                className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Next result"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </>
                    ) : searchTerm ? (
                        <>
                            <span className="text-xs text-red-600 font-medium">
                                No results found
                            </span>
                            <button
                                disabled
                                className="p-1.5 rounded opacity-30 cursor-not-allowed"
                                title="Previous result"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                disabled
                                className="p-1.5 rounded opacity-30 cursor-not-allowed"
                                title="Next result"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="text-xs text-gray-400 whitespace-nowrap font-medium">
                                Search results
                            </span>
                            <button
                                disabled
                                className="p-1.5 rounded opacity-30 cursor-not-allowed"
                                title="Previous result"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                disabled
                                className="p-1.5 rounded opacity-30 cursor-not-allowed"
                                title="Next result"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>

                {/* Download Button */}
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
