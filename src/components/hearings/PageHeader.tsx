import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
    backLink: string;
    backLabel?: string;
    title: string;
    subtitle?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ 
    backLink, 
    backLabel = 'Back', 
    title, 
    subtitle 
}) => {
    return (
        <div className="mb-6">
            <Link to={backLink} className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {backLabel}
            </Link>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-gray-600">{subtitle}</p>}
        </div>
    );
};

export default PageHeader;
