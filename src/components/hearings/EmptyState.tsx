import React from 'react';

interface EmptyStateProps {
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ 
    message = 'No transcripts found', 
    actionLabel = 'Create First Transcript',
    onAction 
}) => {
    return (
        <div className="bg-gray-100 border border-gray-300 px-4 py-8 rounded text-center">
            <p className="text-gray-600 mb-4">{message}</p>
            {onAction && (
                <button
                    onClick={onAction}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};

export default EmptyState;
