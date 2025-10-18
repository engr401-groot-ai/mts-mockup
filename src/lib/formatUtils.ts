/**
 * Common formatting utilities for hearings and transcripts
 */

/**
 * Formats a date string to a localized date format
 * @param dateString - ISO date string or any valid date string
 * @param options - Optional Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string, 
  options?: Intl.DateTimeFormatOptions
): string => {
  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options
    };
    return new Date(dateString).toLocaleDateString('en-US', defaultOptions);
  } catch {
    return dateString;
  }
};

/**
 * Formats a date string to a short format (e.g., "Jan 15, 2024")
 */
export const formatDateShort = (dateString: string): string => {
  return formatDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * Formats a date string to include time (e.g., "January 15, 2024, 2:30 PM")
 */
export const formatDateTime = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleString('en-US');
  } catch {
    return dateString;
  }
};

/**
 * Formats duration in seconds to human-readable format (e.g., "1h 30m" or "45m")
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Formats time in seconds to MM:SS or HH:MM:SS format for video timestamps
 * @param seconds - Time in seconds
 * @returns Formatted timestamp string
 */
export const formatTimestamp = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
