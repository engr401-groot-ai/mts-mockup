/**
 * Utility functions for transcript form handling and validation
 */

import { isValidYouTubeUrl as checkYouTubeUrl } from './youtubeUtils';

export interface BillValidationResult {
    valid: boolean;
    normalized: string[];
    errors: string[];
}

/**
 * Normalizes a bill ID to standard format (e.g., "HB 1234" -> "HB1234")
 */
export const normalizeBillId = (billId: string): string => {
    const normalized = billId.trim().toUpperCase().replace(/\s+/g, '');
    const match = normalized.match(/^(HB|SB)(\d+)$/);
    return match ? `${match[1]}${match[2]}` : normalized;
};

/**
 * Validates and normalizes a comma-separated list of bill IDs
 */
export const validateBillIds = (input: string): BillValidationResult => {
    if (!input.trim()) {
        return { valid: false, normalized: [], errors: ['At least one bill ID is required'] };
    }

    const billArray = input.split(',').map(b => b.trim()).filter(b => b);
    const normalized: string[] = [];
    const errors: string[] = [];

    billArray.forEach(bill => {
        const norm = normalizeBillId(bill);
        if (!/^(HB|SB)\d+$/.test(norm)) {
            errors.push(`Invalid format: "${bill}" (must be HB#### or SB####)`);
        } else {
            normalized.push(norm);
        }
    });

    return {
        valid: errors.length === 0 && normalized.length > 0,
        normalized,
        errors
    };
};

/**
 * Generates a hearing ID from form data
 */
export const generateHearingId = (
    hearingDate: string,
    committee: string,
    billIds: string,
    room: string,
    ampm: string
): string => {
    const validation = validateBillIds(billIds);
    if (!validation.valid) {
        return '';
    }

    const date = hearingDate;
    const comm = committee.toLowerCase().replace(/\s+/g, '');
    const bills = validation.normalized.join('_');
    const roomSlug = room.toLowerCase().replace(/\s+/g, '');
    const period = ampm.toLowerCase();

    return `${date}_${comm}_${bills}_${roomSlug}_${period}`;
};

/**
 * Generates a GCS folder path from form data
 */
export const generateFolderPath = (
    hearingDate: string,
    committee: string,
    billIds: string,
    title: string
): string => {
    const validation = validateBillIds(billIds);
    if (!validation.valid) {
        return '';
    }

    const year = hearingDate.split('-')[0];
    const comm = committee.replace(/\s+/g, '_');
    const bills = validation.normalized.join('_');
    const titleSlug = title.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '_');

    return `${year}/${comm}/${bills}/${titleSlug}`;
};

/**
 * Sanitizes a string for use in URLs/paths
 */
export const sanitizeForPath = (input: string): string => {
    return input.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '_');
};

/**
 * Validates a YouTube URL
 */
export const isValidYouTubeUrl = (url: string): boolean => {
    return checkYouTubeUrl(url);
};

/**
 * Validates transcript form data and returns error object
 */
export const validateTranscriptForm = (data: {
    youtubeUrl: string;
    hearingDate: string;
    chamber: string;
    committee: string;
    billIds: string;
    room: string;
    title: string;
}): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!data.youtubeUrl) {
        errors.youtubeUrl = 'YouTube URL is required';
    } else if (!isValidYouTubeUrl(data.youtubeUrl)) {
        errors.youtubeUrl = 'Must be a valid YouTube URL';
    }

    if (!data.hearingDate) {
        errors.hearingDate = 'Date is required';
    }

    if (!data.chamber) {
        errors.chamber = 'Chamber is required';
    }

    if (!data.committee) {
        errors.committee = 'Committee is required';
    }

    const billValidation = validateBillIds(data.billIds);
    if (!billValidation.valid) {
        errors.billIds = billValidation.errors.join('; ');
    }

    if (!data.room) {
        errors.room = 'Room is required';
    }

    if (!data.title.trim()) {
        errors.title = 'Title is required';
    }

    return errors;
};
