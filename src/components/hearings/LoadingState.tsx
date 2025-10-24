/**
 * LoadingState
 *
 * Small reusable component to show a loading message or short status.
 */
import React from 'react';

interface LoadingStateProps {
    message?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ 
    message = 'Loading...' 
}) => {
    return (
        <div className="bg-gray-100 border border-gray-300 px-4 py-8 rounded text-center">
            <p className="text-gray-600">{message}</p>
        </div>
    );
};

export default LoadingState;
