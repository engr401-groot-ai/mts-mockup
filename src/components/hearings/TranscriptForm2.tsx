import React, { useState, useMemo } from 'react';
import type { TranscriptionRequest } from '../../types/hearings';
import { 
    validateBillIds, 
    validateTranscriptForm, 
    generateHearingId, 
    generateFolderPath,
    sanitizeForPath 
} from '../../lib/transcriptUtils';
import { 
    getCommitteesByChamber, 
    type Chamber 
} from '../../constants/committees';

interface TranscriptForm2Props {
    onSubmit: (data: TranscriptionRequest) => Promise<void>;
    onCancel?: () => void;
}

const TranscriptForm2: React.FC<TranscriptForm2Props> = ({ onSubmit, onCancel }) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [hearingDate, setHearingDate] = useState('');
    const [chamber, setChamber] = useState<Chamber>('');
    const [committee, setCommittee] = useState('');
    const [billIds, setBillIds] = useState('');
    const [room, setRoom] = useState('');
    const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
    const [title, setTitle] = useState('');
    const [transcribing, setTranscribing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const availableCommittees = useMemo(() => getCommitteesByChamber(chamber), [chamber]);

    const hearingId = useMemo(() => {
        if (!hearingDate || !committee || !billIds || !room) {
            return '';
        }
        return generateHearingId(hearingDate, committee, billIds, room, ampm);
    }, [hearingDate, committee, billIds, room, ampm]);

    const folderPath = useMemo(() => {
        if (!hearingDate || !committee || !billIds || !title) {
            return '';
        }
        return generateFolderPath(hearingDate, committee, billIds, title);
    }, [hearingDate, committee, billIds, title]);

    const validateForm = (): boolean => {
        const newErrors = validateTranscriptForm({
            youtubeUrl,
            hearingDate,
            chamber,
            committee,
            billIds,
            room,
            title
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setTranscribing(true);
        setProgress(0);

        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return prev;
                return prev + Math.random() * 15;
            });
        }, 2000);

        try {
            const billValidation = validateBillIds(billIds);
            const year = hearingDate.split('-')[0];
            const billName = billValidation.normalized.join('_');
            const videoTitle = sanitizeForPath(title);

            const data: TranscriptionRequest = {
                youtube_url: youtubeUrl,
                year: year,
                committee: committee,
                bill_name: billName,
                bill_ids: billValidation.normalized,
                video_title: videoTitle,
                hearing_date: hearingDate,
                room: room,
                ampm: ampm
            };

            await onSubmit(data);

            clearInterval(progressInterval);
            setProgress(100);

            setTimeout(() => {
                setYoutubeUrl('');
                setHearingDate('');
                setChamber('');
                setCommittee('');
                setBillIds('');
                setRoom('');
                setAmpm('AM');
                setTitle('');
                setErrors({});
                setProgress(0);
            }, 1000);
        } catch (err) {
            console.error('Form submission error:', err);
            clearInterval(progressInterval);
            setProgress(0);
            
            const errorMessage = err instanceof Error ? err.message : 'Failed to create transcript';
            setErrors(prev => ({ ...prev, submit: errorMessage }));
        } finally {
            clearInterval(progressInterval);
            setTranscribing(false);
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
        setCommittee('');
    };

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
                        />
                        {errors.hearingDate && (
                            <p className="text-red-500 text-xs mt-1">{errors.hearingDate}</p>
                        )}
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
                        >
                            <option value="">Select chamber...</option>
                            <option value="House">House</option>
                            <option value="Senate">Senate</option>
                        </select>
                        {errors.chamber && (
                            <p className="text-red-500 text-xs mt-1">{errors.chamber}</p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="committee" className="block text-sm font-medium mb-2">
                            Committee <span className="text-red-500">*</span>
                        </label>
                        <select
                            id="committee"
                            value={committee}
                            onChange={(e) => setCommittee(e.target.value)}
                            className={`border rounded px-3 py-2 w-full ${errors.committee ? 'border-red-500' : 'border-gray-300'}`}
                            required
                            disabled={!chamber}
                        >
                            <option value="">
                                {chamber ? 'Select a committee...' : 'Select chamber first...'}
                            </option>
                            {availableCommittees.map(comm => (
                                <option key={comm} value={comm}>{comm}</option>
                            ))}
                        </select>
                        {errors.committee && (
                            <p className="text-red-500 text-xs mt-1">{errors.committee}</p>
                        )}
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
                    />
                    {errors.billIds && (
                        <p className="text-red-500 text-xs mt-1">{errors.billIds}</p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        />
                        {errors.room && (
                            <p className="text-red-500 text-xs mt-1">{errors.room}</p>
                        )}
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
                    />
                    {errors.title && (
                        <p className="text-red-500 text-xs mt-1">{errors.title}</p>
                    )}
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
                    />
                    {errors.youtubeUrl && (
                        <p className="text-red-500 text-xs mt-1">{errors.youtubeUrl}</p>
                    )}
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
                        <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold">Transcription in progress...</p>
                            <span className="text-xs font-mono">{Math.round(progress)}%</span>
                        </div>
                        <p className="mt-1 mb-3">This process may take several minutes depending on the video length. Please do not close or refresh this page.</p>
                        
                        {/* Progress bar */}
                        <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                            <div 
                                className="h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${Math.min(progress, 100)}%`,
                                }}
                            />
                        </div>
                        
                        {/* Status message */}
                        <p className="text-xs text-blue-700 mt-2 text-center">
                            {progress < 30 && 'Downloading audio from YouTube...'}
                            {progress >= 30 && progress < 60 && 'Transcribing audio with AI...'}
                            {progress >= 60 && progress < 90 && 'Processing segments and timestamps...'}
                            {progress >= 90 && progress < 100 && 'Uploading to cloud storage...'}
                            {progress >= 100 && 'Complete!'}
                        </p>
                    </div>
                )}
            </form>
        </div>
    );
};

export default TranscriptForm2;
