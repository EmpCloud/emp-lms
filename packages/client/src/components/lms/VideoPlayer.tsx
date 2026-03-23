import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Maximize, List } from "lucide-react";

export interface Chapter {
  title: string;
  startTime: number;
}

interface VideoPlayerProps {
  videoUrl: string;
  chapters?: Chapter[];
  onProgress?: (currentTime: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({ videoUrl, chapters = [], onProgress }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressCbRef = useRef(onProgress);
  const lastReportRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keep ref in sync
  useEffect(() => {
    progressCbRef.current = onProgress;
  }, [onProgress]);

  // Progress reporting every 30s
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    const now = Date.now();
    if (now - lastReportRef.current >= 30000) {
      lastReportRef.current = now;
      progressCbRef.current?.(video.currentTime);
    }
  }, []);

  // Play/pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  // Seek to chapter
  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
    if (video.paused) {
      video.play();
      setPlaying(true);
    }
  };

  // Fullscreen
  const goFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  // Show overlay on mouse move, hide after 3s
  const handleMouseMove = () => {
    setShowOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      if (playing) setShowOverlay(false);
    }, 3000);
  };

  // Current chapter
  const currentChapter = [...chapters]
    .reverse()
    .find((ch) => currentTime >= ch.startTime);

  // Seek bar click
  const handleSeekBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video && duration > 0) {
      video.currentTime = pct * duration;
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div ref={containerRef} className="flex flex-col lg:flex-row w-full bg-black rounded-lg overflow-hidden">
      {/* Video area */}
      <div
        className={`relative flex-1 ${sidebarOpen && chapters.length > 0 ? "lg:mr-0" : ""}`}
        onMouseMove={handleMouseMove}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) setDuration(videoRef.current.duration);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            progressCbRef.current?.(videoRef.current?.duration ?? 0);
          }}
        />

        {/* Play/pause overlay */}
        {showOverlay && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-300"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <div className="rounded-full bg-black/50 p-4">
              {playing ? (
                <Pause className="h-10 w-10 text-white" />
              ) : (
                <Play className="h-10 w-10 text-white" />
              )}
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${
            showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Seek bar */}
          <div
            className="group mb-2 h-1.5 w-full cursor-pointer rounded-full bg-white/30"
            onClick={handleSeekBar}
          >
            <div
              className="relative h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white opacity-0 shadow group-hover:opacity-100 transition" />
            </div>

            {/* Chapter markers */}
            {chapters.map((ch, i) => {
              const pos = duration > 0 ? (ch.startTime / duration) * 100 : 0;
              return (
                <div
                  key={i}
                  className="absolute top-0 h-1.5 w-0.5 bg-white/70"
                  style={{ left: `${pos}%` }}
                  title={ch.title}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="hover:text-brand-400 transition">
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="text-xs font-medium tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              {currentChapter && (
                <span className="text-xs text-gray-300 truncate max-w-[200px]">
                  {currentChapter.title}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {chapters.length > 0 && (
                <button
                  onClick={() => setSidebarOpen((p) => !p)}
                  className="rounded p-1 hover:bg-white/10 transition"
                  title="Toggle chapters"
                >
                  <List className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={goFullscreen}
                className="rounded p-1 hover:bg-white/10 transition"
                title="Fullscreen"
              >
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapter sidebar */}
      {chapters.length > 0 && sidebarOpen && (
        <div className="w-full lg:w-72 shrink-0 bg-gray-900 border-l border-gray-800 overflow-y-auto max-h-[30vh] lg:max-h-none">
          <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Chapters ({chapters.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-800">
            {chapters.map((ch, i) => {
              const isActive = currentChapter?.startTime === ch.startTime;
              return (
                <li key={i}>
                  <button
                    onClick={() => seekTo(ch.startTime)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-gray-800 ${
                      isActive ? "bg-gray-800 text-brand-400" : "text-gray-300"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "bg-brand-600 text-white"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{ch.title}</p>
                      <p className="text-xs text-gray-500">{formatTime(ch.startTime)}</p>
                    </div>
                    {isActive && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
