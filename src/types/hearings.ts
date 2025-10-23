// Core data structures for transcription system

export interface Word {
    word: string;
    start: number;
    end: number;
    probability: number;
}

export interface Segment {
    id: number;
    start: number;
    end: number;
    text: string;
    words: Word[];
}

// UI-specific type for transcript display components
export interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface Metadata {
    hearing_id: string;
    title: string;
    date: string;
    duration: number;
    youtube_url: string;
    year: string;
    committee: string | string[];
    bill_name: string;
    bill_ids?: string[];
    video_title: string;
    room: string;
    ampm: string;
    folder_path: string;
    created_at: string;
}

export interface Transcript {
    hearing_id: string;
    text: string;
    language: string;
    duration: number;
    processing_time: number;
    model: string;
    segments: Segment[];
    total_segments: number;
    created_at: string;
}

export interface PythonAPIResponse {
    metadata: Metadata;
    transcript: Transcript;
    folder_path: string;
    metadata_path?: string;
    transcript_path?: string;
    cached: boolean;
    stats?: {
        duration_minutes: number;
        processing_time_minutes: number;
        segments: number;
        model: string;
    };
}

export interface TranscriptionRequest {
    youtube_url: string;
    year: string;
    committee: string | string[];
    bill_name: string;
    bill_ids?: string[];
    video_title: string;
    hearing_date: string;
    room?: string;
    ampm?: string;
}

export interface FormattedWord {
    word: string;
    startTime: number;
    endTime: number;
}

export interface FormattedSegment {
    transcript: string;
    words: FormattedWord[];
}

export interface ClientResponse {
    transcription: FormattedSegment[];
    fullText: string;
    youtube_url: string;
    segments: Segment[];
    folderPath: string;
    metadataPath?: string;
    transcriptPath?: string;
    cached?: boolean;
    metadata: Metadata;
    transcriptInfo: {
        model: string;
        processing_time: number;
        total_segments: number;
        language: string;
    };
}

export interface TranscriptListItem {
    hearing_id: string;
    title: string;
    date: string;
    duration: number;
    duration_minutes: number;
    youtube_url: string;
    year: string;
    committee: string;
    bill_name: string;
    video_title: string;
    room: string;
    ampm: string;
    folder_path: string;
    created_at: string;
}

// Search-related types
export interface SearchMatch {
    segmentId: number;
    matchIndex: number;
}

export interface SearchResults {
    total: number;
    current: number;
    matches: SearchMatch[];
}
