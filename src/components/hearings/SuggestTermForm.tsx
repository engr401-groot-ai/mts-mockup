import React, { useState } from 'react';

const SuggestTermForm: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [category, setCategory] = useState('');
    const [term, setTerm] = useState('');
    const [aliases, setAliases] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const reset = () => {
        setName('');
        setEmail('');
        setCategory('');
        setTerm('');
        setAliases('');
        setNotes('');
    };

    const validateEmail = (e: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    };

    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        setError(null);
        setSuccess(null);

        if (!name.trim() || !email.trim() || !category.trim() || !term.trim()) {
            setError('Please fill the required fields: Name, Email, Category, Term.');
            return;
        }

        if (!validateEmail(email.trim())) {
            setError('Please enter a valid email address.');
            return;
        }

        const aliasesArray = aliases
            .split(/[,;\s]+/)
            .map(a => a.trim())
            .filter(Boolean);

        const payload = {
            name: name.trim(),
            email: email.trim(),
            category: category.trim(),
            terms: [
                {
                    term: term.trim(),
                    aliases: aliasesArray,
                    notes: notes.trim()
                }
            ]
        };

        try {
            setLoading(true);
            const res = await fetch('http://localhost:3001/api/sheet/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }

            setSuccess('Thanks — your suggestion was submitted.');
            reset();
            setTimeout(() => {
                setSuccess(null);
                setOpen(false);
            }, 1800);
        } catch (err) {
            setError(String(err instanceof Error ? err.message : err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="text-sm text-blue-600 hover:underline"
                aria-expanded={open}
                aria-label="Suggest term"
            >
                Suggest term
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* backdrop */}
                    <div
                        className="fixed inset-0 bg-black opacity-40"
                        onClick={() => { setOpen(false); setError(null); setSuccess(null); }}
                    />

                    {/* modal dialog */}
                    <div className="relative z-10 w-full max-w-2xl mx-4 bg-white border rounded shadow-lg p-6">
                        <div className="flex items-start justify-between mb-4">
                            <h3 className="text-lg font-semibold">Suggest a term</h3>
                            <button
                                type="button"
                                aria-label="Close"
                                onClick={() => { setOpen(false); setError(null); setSuccess(null); }}
                                className="text-gray-500 hover:text-gray-700 text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>

                            <div className="mb-3">
                                <label className="block text-sm text-gray-700">Name *</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base"
                                    required
                                />
                            </div>

                            <div className="mb-3">
                                <label className="block text-sm text-gray-700">Email *</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base"
                                    required
                                />
                            </div>

                            <div className="mb-3">
                                <label className="block text-sm text-gray-700">Category *</label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base"
                                    required
                                />
                            </div>

                            <div className="mb-3">
                                <label className="block text-sm text-gray-700">Term *</label>
                                <input
                                    type="text"
                                    value={term}
                                    onChange={(e) => setTerm(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base"
                                    required
                                />
                            </div>

                            <div className="mb-3">
                                <label className="block text-sm text-gray-700">Aliases (comma separated)</label>
                                <input
                                    type="text"
                                    value={aliases}
                                    onChange={(e) => setAliases(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base"
                                    placeholder="alias1, alias2"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm text-gray-700">Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full mt-2 border rounded px-3 py-2 text-base h-32"
                                    placeholder="Optional notes"
                                />
                            </div>

                            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
                            {success && <div className="text-xs text-green-600 mb-2">{success}</div>}

                            <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className={`px-4 py-2 text-base rounded border bg-blue-600 text-white ${loading ? 'opacity-60' : 'hover:bg-blue-700'}`}
                                        >
                                            {loading ? 'Submitting…' : 'Submit'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setOpen(false); setError(null); setSuccess(null); }}
                                            className="px-4 py-2 text-base rounded border bg-gray-100 hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500">* required</span>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuggestTermForm;