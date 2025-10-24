import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { getYouTubeVideoId, getYouTubeEmbedUrl } from '../../lib/youtubeUtils';

interface VideoPlayerProps {
    url: string;
    onProgress?: (state: { playedSeconds: number }) => void;
}

export interface VideoPlayerRef {
    seekTo: (seconds: number) => void;
}

/**
 * VideoPlayer Component
 * 
 * Embeds YouTube videos with seek functionality for transcript timestamp navigation.
 * Uses YouTube's embedded player API to control playback.
 */
const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
    ({ url }, ref) => {
        const iframeRef = useRef<HTMLIFrameElement>(null);

        const videoId = getYouTubeVideoId(url);

        useImperativeHandle(ref, () => ({
            seekTo: (seconds: number) => {
                if (iframeRef.current && videoId) {
                    const newSrc = getYouTubeEmbedUrl(videoId, seconds, true);
                    iframeRef.current.src = newSrc;
                }
            },
        }), [videoId]);

        if (!videoId) {
            return (
                <div className="bg-gray-100 h-64 flex items-center justify-center rounded">
                    <p className="text-gray-500">Invalid YouTube URL</p>
                </div>
            );
        }

        return (
            <div className="w-full">
                <iframe
                    ref={iframeRef}
                    width="100%"
                    height="360"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="Hearing Video Player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="rounded"
                />
            </div>
        );
    }
);

VideoPlayer.displayName = 'VideoPlayer';
export default VideoPlayer;