import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Download, CaseUpper } from 'lucide-react';

interface TranscriptDropdownProps {
    onDownload: () => void;
    onShowKeyterms: () => void;
}

/**
 * TranscriptDropdown
 *
 * Dropdown that groups Download + Show Keyterms actions
 */
const TranscriptDropdown: React.FC<TranscriptDropdownProps> = ({ onDownload, onShowKeyterms }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (!ref.current) return;
            if (e.target instanceof Node && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }

        document.addEventListener('click', onDoc);
        return () => document.removeEventListener('click', onDoc);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-100 transition-colors"
                title="More options"
            >
                <MoreHorizontal className="w-5 h-5 text-gray-700" />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-56 bg-white border rounded-md shadow-lg z-20">
                    <div className="py-2">
                        <button
                            onClick={() => { setOpen(false); onDownload(); }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
                        >
                            <Download className="w-4 h-4 text-gray-600" />
                            <span className="text-sm">Download transcript</span>
                        </button>

                        <button
                            onClick={() => { setOpen(false); onShowKeyterms(); }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
                        >
                            <CaseUpper className="w-4 h-4 text-gray-600" />
                            <span className="text-sm">Show Key Terms</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TranscriptDropdown;
