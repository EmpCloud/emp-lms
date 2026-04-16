import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import { PdfViewer } from "./PdfViewer";
import { ArticleReader } from "./ArticleReader";

export interface LessonInput {
  id: string;
  title: string;
  description?: string;
  contentType?: string;
  content_type?: string;
  content?: string;
  contentUrl?: string;
  content_url?: string;
  contentText?: string;
  content_text?: string;
  duration?: number;
  moduleTitle?: string;
}

interface Props {
  lesson: LessonInput;
  isCompleted: boolean;
  onComplete: (timeSpentSec?: number) => void;
  saving?: boolean;
}

/**
 * Dispatches a lesson to the right player based on content_type and
 * exposes a single "Mark Complete" affordance + auto-complete for media
 * lessons. Intentionally simple — each individual player is in its own file.
 */
export function LessonPlayer({ lesson, isCompleted, onComplete, saving }: Props) {
  const contentType = lesson.contentType ?? lesson.content_type ?? "text";
  const contentUrl = lesson.contentUrl ?? lesson.content_url ?? lesson.content ?? "";
  const contentText =
    lesson.contentText ?? lesson.content_text ?? (contentType === "text" ? lesson.content : "") ?? "";

  // Track time on the lesson so we can attribute it on complete.
  const startedAt = useRef<number>(Date.now());
  useEffect(() => {
    startedAt.current = Date.now();
  }, [lesson.id]);
  const timeSpentSec = () => Math.round((Date.now() - startedAt.current) / 1000);

  const [autoCompletable, setAutoCompletable] = useState(false);

  return (
    <div className="space-y-5">
      {lesson.moduleTitle && (
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {lesson.moduleTitle}
        </p>
      )}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{lesson.title}</h2>
        {lesson.description && (
          <p className="mt-1 text-sm text-gray-500">{lesson.description}</p>
        )}
      </div>

      {/* Player body */}
      <div className="overflow-hidden rounded-lg border border-gray-100">
        {contentType === "video" ? (
          <VideoPlayer
            src={contentUrl}
            onEnded={() => setAutoCompletable(true)}
          />
        ) : contentType === "document" ? (
          <PdfViewer src={contentUrl} onViewed={() => setAutoCompletable(true)} />
        ) : contentType === "text" || contentType === "slide" ? (
          <ArticleReader text={contentText} onScrolledToEnd={() => setAutoCompletable(true)} />
        ) : contentType === "link" || contentType === "embed" ? (
          <div className="p-8 text-center">
            <a
              href={contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              onClick={() => setAutoCompletable(true)}
            >
              Open resource <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-gray-400">
              Mark this lesson complete once you've reviewed the linked material.
            </p>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">
            Content type <span className="font-mono">{contentType}</span> is not yet playable here.
            You can still mark the lesson complete below.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">
          {contentType === "video"
            ? "Marks complete when the video finishes, or tap the button."
            : contentType === "text" || contentType === "slide"
              ? "Marks complete when you reach the end of the article."
              : "Tap the button when you're done."}
        </p>
        {isCompleted ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Completed
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onComplete(timeSpentSec())}
            disabled={saving}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:opacity-50 ${
              autoCompletable ? "bg-green-600 hover:bg-green-700" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : autoCompletable ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Mark Complete
              </>
            ) : (
              "Mark Complete"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
