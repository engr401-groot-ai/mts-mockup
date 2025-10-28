import React, { useState, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import type { TranscriptionRequest } from '../../types/hearings';
import {
    validateBillIds,
    validateTranscriptForm,
    generateHearingId,
    generateFolderPath,
    sanitizeForPath,
} from '../../lib/transcriptUtils';
import { getCommitteesByChamber, type Chamber } from '../../lib/constants/committees';

interface TranscriptFormProps {
    onSubmit: (data: TranscriptionRequest) => Promise<unknown>;
    onCancel?: () => void;
}

/**
 * TranscriptForm Component
 * 
 * Form for creating new hearing transcripts. Handles validation,
 * auto-generates hearing IDs and folder paths, and submits data
 * for transcription processing.
 */
const TranscriptForm: React.FC<TranscriptFormProps> = ({ onSubmit, onCancel }) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [hearingDate, setHearingDate] = useState('');
    const [chamber, setChamber] = useState<Chamber>('');
    const [committee, setCommittee] = useState<string[]>([]);
    const [billIds, setBillIds] = useState('');
    const [room, setRoom] = useState('');
    const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
    const [title, setTitle] = useState('');
    const [transcribing, setTranscribing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [jobId, setJobId] = useState<string | null>(null);
    const [progressPercent, setProgressPercent] = useState<number>(0);
    const [queuedFolderPath, setQueuedFolderPath] = useState<string | null>(null);

    const availableCommittees = useMemo(() => getCommitteesByChamber(chamber), [chamber]);

    const hearingId = useMemo(() => {
        if (!hearingDate || (Array.isArray(committee) ? committee.length === 0 : !committee) || !billIds || !room) return '';
        return generateHearingId(hearingDate, committee, billIds, room, ampm);
    }, [hearingDate, committee, billIds, room, ampm]);

    const folderPath = useMemo(() => {
        if (!hearingDate || (Array.isArray(committee) ? committee.length === 0 : !committee) || !billIds || !title) return '';
        return generateFolderPath(hearingDate, committee, billIds, title);
    }, [hearingDate, committee, billIds, title]);

    const validateForm = (): boolean => {
        const newErrors = validateTranscriptForm({ youtubeUrl, hearingDate, chamber, committee, billIds, room, title });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return; 

    setTranscribing(true);
    setJobId(null);
    setQueuedFolderPath(null);
    setProgressPercent(0);

        let startedBackgroundJob = false;

        try {
            const billValidation = validateBillIds(billIds);
            const year = hearingDate.split('-')[0];
            const billName = billValidation.normalized.join('_');
            const videoTitle = sanitizeForPath(title);

            const data: TranscriptionRequest = {
                youtube_url: youtubeUrl,
                year,
                committee,
                bill_name: billName,
                bill_ids: billValidation.normalized,
                video_title: videoTitle,
                hearing_date: hearingDate,
                room,
                ampm,
            };

            const startResult = await onSubmit(data);
            const sr = startResult as Record<string, unknown> | null;

            if (sr && 'folder_path' in sr && sr.folder_path) {
                startedBackgroundJob = true;
                setQueuedFolderPath(String(sr.folder_path));
                setProgressPercent(0);
            } else if (sr && 'transcript' in sr && sr.transcript) {
                setProgressPercent(100);
                setYoutubeUrl('');
                setHearingDate('');
                setChamber('');
                setCommittee([]);
                setBillIds('');
                setRoom('');
                setAmpm('AM');
                setTitle('');
                setErrors({});
                toast({
                    title: 'Transcription completed',
                    description: 'Transcription completed successfully!',
                    duration: 4000,
                });
                window.dispatchEvent(new Event('transcript-updated'));
            }
        } catch (err) {
            console.error('Form submission error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to create transcript';
            setErrors(prev => ({ ...prev, submit: errorMessage }));
        } finally {
            if (!startedBackgroundJob) setTranscribing(false);
        }
    };

    const handleBillIdsBlur = () => {
        const validation = validateBillIds(billIds);
        if (validation.valid) {
            setBillIds(validation.normalized.join(', '));
            setErrors(prev => ({ ...prev, billIds: '' }));
        }
    };

    const handleChamberChange = (newChamber: Chamber) => {
        setChamber(newChamber);
        setCommittee([]);
    };

    const [selectedCommitteeOption, setSelectedCommitteeOption] = useState('');

    const addSelectedCommittee = (comm: string) => {
        if (!comm) return;
        setCommittee(prev => (prev.includes(comm) ? prev : [...prev, comm]));
        setSelectedCommitteeOption('');
    };

    const removeCommittee = (comm: string) => {
        setCommittee(prev => prev.filter(c => c !== comm));
    };

    const inputDisabled = transcribing;


    return (
        <div className="bg-white border rounded-lg p-6 mb-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4">Create New Transcript</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="hearingDate" className="block text-sm font-medium mb-2">
                            Hearing Date <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="hearingDate"
                            type="date"
                            value={hearingDate}
                            onChange={(e) => setHearingDate(e.target.value)}
                            className={`border rounded px-3 py-2 w-full ${errors.hearingDate ? 'border-red-500' : 'border-gray-300'}`}
                            required
                            disabled={inputDisabled}
                        />
                        {errors.hearingDate && <p className="text-red-500 text-xs mt-1">{errors.hearingDate}</p>}
                    </div>

                    <div>
                        <label htmlFor="chamber" className="block text-sm font-medium mb-2">
                            Chamber <span className="text-red-500">*</span>
                        </label>
                        <select
                            id="chamber"
                            value={chamber}
                            onChange={(e) => handleChamberChange(e.target.value as Chamber)}
                            className={`border rounded px-3 py-2 w-full ${errors.chamber ? 'border-red-500' : 'border-gray-300'}`}
                            required
                            disabled={inputDisabled}
                        >
                            <option value="">Select chamber...</option>
                            <option value="House">House</option>
                            <option value="Senate">Senate</option>
                        </select>
                        {errors.chamber && <p className="text-red-500 text-xs mt-1">{errors.chamber}</p>}
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-2">
                            Committee <span className="text-red-500">*</span>
                        </label>
                        <div className="space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                <div className="md:col-span-1">
                                    <select
                                        id="committee"
                                        value={selectedCommitteeOption}
                                        onChange={(e) => addSelectedCommittee(e.target.value)}
                                        className={`border rounded px-3 py-2 w-full ${errors.committee ? 'border-red-500' : 'border-gray-300'}`}
                                        disabled={!chamber || inputDisabled}
                                    >
                                        <option value="">{chamber ? 'Add a committee...' : 'Select chamber first...'}</option>
                                        {availableCommittees.map(comm => (
                                            <option key={comm} value={comm}>{comm}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2 flex justify-end">
                                    <div className="h-12 bg-gray-100 border border-gray-200 rounded px-2 flex items-center w-full">
                                        {committee.length === 0 ? (
                                            <div className="w-full text-center text-sm text-gray-500">No committees selected</div>
                                        ) : (
                                            <div className="flex gap-2 overflow-x-auto py-1 pl-1">
                                                {committee.map(comm => (
                                                    <span key={comm} className="inline-flex items-center bg-white px-2 py-1 rounded-full border flex-shrink-0">
                                                        <span className="text-sm mr-2">{comm}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeCommittee(comm)}
                                                            aria-label={`Remove ${comm}`}
                                                            className="text-xs text-gray-500 hover:text-gray-800"
                                                            disabled={inputDisabled}
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {errors.committee && <p className="text-red-500 text-xs mt-1">{errors.committee}</p>}
                    </div>
                </div>

                <div>
                    <label htmlFor="billIds" className="block text-sm font-medium mb-2">
                        Bill ID(s) <span className="text-red-500">*</span>
                        <span className="text-gray-500 text-xs ml-2">(Format: HB1234, SB5678. Separate multiple with commas)</span>
                    </label>
                    <input
                        id="billIds"
                        type="text"
                        value={billIds}
                        onChange={(e) => setBillIds(e.target.value)}
                        onBlur={handleBillIdsBlur}
                        className={`border rounded px-3 py-2 w-full ${errors.billIds ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="HB1168, SB2024"
                        required
                        disabled={inputDisabled}
                    />
                    {errors.billIds && <p className="text-red-500 text-xs mt-1">{errors.billIds}</p>}
                </div>

                <div>
                    <div className="md:col-span-2">
                        <label htmlFor="room" className="block text-sm font-medium mb-2">
                            Room <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="room"
                            type="text"
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            className={`border rounded px-3 py-2 w-full ${errors.room ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="e.g., Room 229, Senate Chamber"
                            required
                            disabled={inputDisabled}
                        />
                        {errors.room && <p className="text-red-500 text-xs mt-1">{errors.room}</p>}
                    </div>

                    <div>
                        <label htmlFor="ampm" className="block text-sm font-medium mb-2">
                            Time Period <span className="text-red-500">*</span>
                        </label>
                        <select
                            id="ampm"
                            value={ampm}
                            onChange={(e) => setAmpm(e.target.value as 'AM' | 'PM')}
                            className="border border-gray-300 rounded px-3 py-2 w-full"
                            required
                            disabled={inputDisabled}
                        >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="title" className="block text-sm font-medium mb-2">
                        Title <span className="text-red-500">*</span>
                        <span className="text-gray-500 text-xs ml-2">(e.g., "Morning Session", "Committee Hearing")</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={`border rounded px-3 py-2 w-full ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="Morning Session"
                        required
                        disabled={inputDisabled}
                    />
                    {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                </div>

                <div>
                    <label htmlFor="youtubeUrl" className="block text-sm font-medium mb-2">
                        YouTube URL <span className="text-red-500">*</span>
                    </label>
                    <input
                        id="youtubeUrl"
                        type="url"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        className={`border rounded px-3 py-2 w-full ${errors.youtubeUrl ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                        disabled={inputDisabled}
                    />
                    {errors.youtubeUrl && <p className="text-red-500 text-xs mt-1">{errors.youtubeUrl}</p>}
                </div>

                {hearingId && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-4">
                        <h3 className="text-sm font-semibold mb-2 text-gray-700">Auto-Generated:</h3>
                        <div className="space-y-2 text-sm">
                            <div>
                                <span className="font-medium text-gray-600">Hearing ID:</span>
                                <code className="ml-2 bg-white px-2 py-1 rounded border text-xs">{hearingId}</code>
                            </div>
                            <div>
                                <span className="font-medium text-gray-600">Folder Path:</span>
                                <code className="ml-2 bg-white px-2 py-1 rounded border text-xs break-all">{folderPath}</code>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button
                        type="submit"
                        className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        disabled={transcribing}
                    >
                        {transcribing ? 'Transcribing...' : 'Create Transcript'}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            disabled={transcribing}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {errors.submit && (
                    <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">
                        <p className="font-semibold">Error:</p>
                        <p className="mt-1">{errors.submit}</p>
                    </div>
                )}

                {transcribing && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
                        <p className="font-semibold">Transcription in progress...</p>
                        <p className="mt-2">This process may take several minutes depending on the video length. Please do not close or refresh this page.</p>
                    </div>
                )}
            </form>
        </div>
    );
};

export default TranscriptForm;