import React, { useRef, forwardRef, useImperativeHandle } from 'react';

interface VideoPlayerProps {
    url: string;
    onProgress?: (state: { playedSeconds: number }) => void;
}

export interface VideoPlayerRef {
    seekTo: (seconds: number) => void;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
    ({ url, onProgress }, ref) => {
        const iframeRef = useRef<HTMLIFrameElement>(null);

        const getYoutubeVideoId = (url: string) => {
            try {
                const match = url.match(
                    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([\w-]{11})/
                );
                return match ? match[1] : null;
            } catch {
                return null;
            }
        };

        const videoId = getYoutubeVideoId(url);

        useImperativeHandle(ref, () => ({
            seekTo: (seconds: number) => {
                if (iframeRef.current && videoId) {
                    const newSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(seconds)}&autoplay=1`;
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