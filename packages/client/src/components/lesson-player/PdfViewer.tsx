import { useEffect, useRef } from "react";

interface Props {
  src: string;
  onViewed?: () => void;
}

/**
 * Minimal PDF viewer — uses the browser's native <embed> which works for
 * any PDF, .docx preview URL, or Office viewer link. Calls onViewed after
 * a short delay so the user can still tap the Mark Complete button if they
 * prefer, but it won't auto-fire the moment the page mounts.
 */
export function PdfViewer({ src, onViewed }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!src || firedRef.current) return;
    // Give the user 5 seconds with the document before considering it "viewed"
    // so accidentally clicking a lesson doesn't mark it consumed.
    const t = setTimeout(() => {
      firedRef.current = true;
      onViewed?.();
    }, 5000);
    return () => clearTimeout(t);
  }, [src, onViewed]);

  if (!src) {
    return (
      <div className="flex h-64 items-center justify-center bg-gray-100 text-sm text-gray-400">
        No document URL configured for this lesson.
      </div>
    );
  }

  return (
    <div className="relative h-[70vh] w-full bg-gray-100">
      <iframe
        src={src}
        title="Lesson document"
        className="h-full w-full"
      />
    </div>
  );
}
