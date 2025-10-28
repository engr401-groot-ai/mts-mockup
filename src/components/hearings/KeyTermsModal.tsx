import React, { useEffect, useState } from 'react';
import SuggestTermModal from './SuggestTermModal';

interface KeytermsModalProps {
    open: boolean;
    onClose: () => void;
    // Optional: parent can provide a handler to open a standalone SuggestTermModal
    onOpenSuggest?: () => void;
}

/**
 * KeytermsModal
 *
 * Modal that displays key terms and allows users to suggest new ones.
 */
const KeytermsModal: React.FC<KeytermsModalProps> = ({ open, onClose, onOpenSuggest }) => {
    const [rows, setRows] = useState<unknown[][]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'suggest'>('list');

    // Prevent background scroll while modal is open
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        if (open) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        // notify other components that keyterms modal opened (so they can close)
        window.dispatchEvent(new CustomEvent('keyterms-open'));
        if (view !== 'list') return;

        let mounted = true;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const res = await fetch('http://localhost:3001/api/sheet');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!mounted) return;
                if (!Array.isArray(data)) {
                    setError('Unexpected sheet response');
                    return;
                }
                setRows(data as unknown[][]);
            } catch (err) {
                if (!mounted) return;
                setError(String(err instanceof Error ? err.message : err));
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => { mounted = false; };
    }, [open, view]);

    // If another component opens the suggest-term modal, close this keyterms modal
    useEffect(() => {
        function onSuggestOpen() {
            if (open) onClose();
        }
        window.addEventListener('suggest-term-open', onSuggestOpen as EventListener);
        return () => window.removeEventListener('suggest-term-open', onSuggestOpen as EventListener);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black opacity-40" onClick={onClose} />

            <div className="relative z-10 w-full max-w-3xl mx-4 bg-white border rounded shadow-lg p-6">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold">Key Terms</h3>
                    <button aria-label="Close" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg">×</button>
                </div>

                {view === 'list' && (
                    <div className="mt-4 mb-2 flex items-center justify-between">
                        <p className="text-sm text-muted">Total: {rows.length}</p>
                        <button
                            onClick={() => {
                                if (onOpenSuggest) {
                                    onClose();
                                    onOpenSuggest();
                                } else {
                                    setView('suggest');
                                    window.dispatchEvent(new CustomEvent('keyterms-open'));
                                }
                            }}
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Suggest Term
                        </button>
                    </div>
                )}

                {view === 'list' ? (
                    <>
                        {loading ? (
                            <div className="text-sm text-gray-500">Loading Key Terms…</div>
                        ) : error ? (
                            <div className="text-sm text-red-500">Failed to load Key Terms: {error}</div>
                        ) : rows.length === 0 ? (
                            <div className="text-sm text-gray-500">No Key Terms found.</div>
                        ) : (
                            <div>
                                <textarea
                                    readOnly
                                    value={rows
                                        .map(r => String((r && r[1]) || '').trim())
                                        .filter(Boolean)
                                        .join(', ')}
                                    className="w-full h-40 border rounded p-2 text-sm text-muted resize-none overflow-y-auto"
                                    onWheel={(e) => {
                                        const el = e.currentTarget as HTMLTextAreaElement;
                                        const deltaY = e.deltaY;
                                        const atTop = el.scrollTop === 0 && deltaY < 0;
                                        const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight && deltaY > 0;
                                        if (atTop || atBottom) {
                                            e.preventDefault();
                                        }
                                        e.stopPropagation();
                                    }}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <SuggestTermModal open={true} onClose={() => setView('list')} />
                )}
            </div>
        </div>
    );
};

export default KeytermsModal;