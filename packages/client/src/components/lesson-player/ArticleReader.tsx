import { useEffect, useRef } from "react";

interface Props {
  text: string;
  onScrolledToEnd?: () => void;
}

/**
 * Plain-text / markdown-ish article reader. Fires onScrolledToEnd once the
 * user has scrolled past ~90% of the content, or immediately if the content
 * fits within the viewport (no scroll needed to read it).
 */
export function ArticleReader({ text, onScrolledToEnd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !text) return;

    const check = () => {
      if (firedRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      // Short articles that fit the container → mark viewed after a brief delay.
      if (scrollHeight <= clientHeight + 4) {
        firedRef.current = true;
        // defer so it runs after first paint
        setTimeout(() => onScrolledToEnd?.(), 1500);
        return;
      }
      // Long articles → fire when scrolled past 90%.
      const scrolledPct = (scrollTop + clientHeight) / scrollHeight;
      if (scrolledPct >= 0.9) {
        firedRef.current = true;
        onScrolledToEnd?.();
      }
    };

    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [text, onScrolledToEnd]);

  if (!text) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        This lesson has no text content.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="prose prose-sm max-h-[60vh] max-w-none overflow-y-auto px-6 py-5 text-gray-800"
    >
      {text.split("\n").map((line, i) => (
        <p key={i} className="my-2 leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}
