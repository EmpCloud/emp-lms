import { useMemo } from "react";

interface Props {
  src: string;
  onEnded?: () => void;
}

/**
 * Minimal video player. Handles three shapes:
 *  - Direct file URL (mp4/webm/etc.) → native <video>
 *  - YouTube URL → <iframe>
 *  - Vimeo URL → <iframe>
 *
 * onEnded fires for native video only. YouTube/Vimeo require their embed
 * APIs to detect end, which we skip in Sprint 1 — the user taps the
 * "Mark Complete" button manually for embedded videos.
 */
export function VideoPlayer({ src, onEnded }: Props) {
  const embedded = useMemo(() => {
    if (!src) return null;
    // YouTube
    const ytMatch = src.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    );
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    // Vimeo
    const vimeoMatch = src.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    return null;
  }, [src]);

  if (!src) {
    return (
      <div className="flex h-64 items-center justify-center bg-gray-100 text-sm text-gray-400">
        No video URL configured for this lesson.
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="relative aspect-video w-full bg-black">
        <iframe
          src={embedded}
          title="Lesson video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      className="aspect-video w-full bg-black"
      onEnded={onEnded}
    >
      Your browser does not support the video tag.
    </video>
  );
}
