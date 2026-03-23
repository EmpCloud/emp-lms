import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, AlertCircle, Maximize, Minimize } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost, api } from "@/api/client";

interface ScormLaunch {
  url: string;
  title?: string;
}

interface ScormTracking {
  completionStatus: "not attempted" | "incomplete" | "completed";
  progressMeasure: number;
  score?: number;
  totalTime?: string;
  suspendData?: string;
}

export default function ScormPlayerPage() {
  const { packageId } = useParams<{ packageId: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch launch URL
  const {
    data: launchData,
    isLoading: launchLoading,
    error: launchError,
  } = useQuery({
    queryKey: ["scorm", packageId, "launch"],
    queryFn: () => apiGet<ScormLaunch>(`/scorm/${packageId}/launch`),
    enabled: !!packageId,
  });

  // Fetch tracking status
  const {
    data: trackingData,
    refetch: refetchTracking,
  } = useQuery({
    queryKey: ["scorm", packageId, "tracking"],
    queryFn: () => apiGet<ScormTracking>(`/scorm/${packageId}/tracking`),
    enabled: !!packageId,
    refetchInterval: 15000,
  });

  const tracking = trackingData?.data;
  const launchUrl = launchData?.data?.url;
  const title = launchData?.data?.title ?? "SCORM Content";

  // Sync tracking progress
  useEffect(() => {
    if (tracking) {
      setProgress(Math.round((tracking.progressMeasure ?? 0) * 100));
    }
  }, [tracking]);

  // Listen for postMessage from SCORM content
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (!packageId) return;

      const { type, payload } = event.data ?? {};
      if (type === "scorm:commit" || type === "scorm:progress") {
        try {
          await apiPost(`/scorm/${packageId}/tracking`, payload);
          refetchTracking();
          if (payload?.progressMeasure != null) {
            setProgress(Math.round(payload.progressMeasure * 100));
          }
        } catch {
          // silently fail; will retry on next commit
        }
      }

      if (type === "scorm:completed") {
        setProgress(100);
        toast.success("Course completed!");
        refetchTracking();
      }
    },
    [packageId, refetchTracking],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Save progress and exit
  const handleExit = async () => {
    if (!packageId) return;
    setSaving(true);
    try {
      // Send terminate to iframe content
      iframeRef.current?.contentWindow?.postMessage({ type: "scorm:terminate" }, "*");
      // Save current state
      await apiPost(`/scorm/${packageId}/tracking`, {
        action: "exit",
        completionStatus: tracking?.completionStatus ?? "incomplete",
        progressMeasure: progress / 100,
      });
      toast.success("Progress saved");
    } catch {
      toast.error("Could not save progress");
    } finally {
      setSaving(false);
      navigate(-1);
    }
  };

  // Loading state
  if (launchLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  // Error state
  if (launchError || !launchUrl) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-900 text-white">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg">Failed to load SCORM package.</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-screen flex-col bg-gray-900">
      {/* Top bar */}
      <header className="flex items-center justify-between bg-gray-800 px-4 py-2 shadow">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Exit
          </button>
          <h1 className="text-sm font-semibold text-white truncate max-w-md">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-300">
              {progress}%
            </span>
          </div>

          {tracking?.completionStatus === "completed" && (
            <span className="rounded-full bg-green-600/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
              Completed
            </span>
          )}

          <button
            onClick={toggleFullscreen}
            className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* SCORM iframe */}
      <div className="flex-1">
        <iframe
          ref={iframeRef}
          src={launchUrl}
          title={title}
          className="h-full w-full border-0"
          allow="fullscreen; autoplay; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
