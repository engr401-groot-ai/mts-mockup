/**
 * Utility functions for handling YouTube videos
 */

/**
 * Extracts YouTube video ID from various URL formats
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * 
 * @param url - YouTube URL string
 * @returns Video ID or null if invalid
 */
export const getYouTubeVideoId = (url: string): string | null => {
  try {
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([\w-]{11})/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

/**
 * Validates if a string is a valid YouTube URL
 * @param url - URL to validate
 * @returns true if valid YouTube URL
 */
export const isValidYouTubeUrl = (url: string): boolean => {
  return url.includes('youtube.com') || url.includes('youtu.be');
};

/**
 * Generates a YouTube embed URL with optional parameters
 * @param videoId - YouTube video ID
 * @param startSeconds - Optional start time in seconds
 * @param autoplay - Optional autoplay flag
 * @returns YouTube embed URL
 */
export const getYouTubeEmbedUrl = (
  videoId: string,
  startSeconds?: number,
  autoplay: boolean = false
): string => {
  const params = new URLSearchParams();
  
  if (startSeconds !== undefined) {
    params.set('start', Math.floor(startSeconds).toString());
  }
  
  if (autoplay) {
    params.set('autoplay', '1');
  }
  
  const queryString = params.toString();
  return `https://www.youtube.com/embed/${videoId}${queryString ? `?${queryString}` : ''}`;
};
