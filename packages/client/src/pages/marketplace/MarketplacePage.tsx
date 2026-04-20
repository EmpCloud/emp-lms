import { useEffect, useMemo, useState } from "react";
import { Store, Search, Import, Loader2, ExternalLink, X } from "lucide-react";
import toast from "react-hot-toast";
import { useMarketplace, useCourses, useCourse, useImportMarketplaceItem } from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "scorm", label: "SCORM" },
  { value: "video", label: "Video" },
  { value: "document", label: "Document" },
  { value: "slide", label: "Slide" },
  { value: "link", label: "Link" },
  { value: "embed", label: "Embed" },
  { value: "xapi", label: "xAPI" },
  { value: "text", label: "Article" },
];

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    scorm: "bg-purple-100 text-purple-700",
    video: "bg-blue-100 text-blue-700",
    text: "bg-green-100 text-green-700",
    article: "bg-green-100 text-green-700",
    document: "bg-amber-100 text-amber-700",
    slide: "bg-pink-100 text-pink-700",
    link: "bg-cyan-100 text-cyan-700",
    embed: "bg-indigo-100 text-indigo-700",
    xapi: "bg-fuchsia-100 text-fuchsia-700",
  };
  const cls = colors[type] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {type}
    </span>
  );
}

export default function MarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [importTarget, setImportTarget] = useState<{ id: string; title: string } | null>(null);

  const params: Record<string, any> = {};
  if (search) params.search = search;
  if (typeFilter !== "all") params.content_type = typeFilter;

  const { data, isLoading } = useMarketplace(params);
  const items: any[] = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Content Marketplace</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search marketplace…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Store className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No content found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item: any) => {
            const type = item.content_type ?? item.type;
            const thumbnail = item.thumbnail_url ?? item.thumbnail;
            return (
              <div
                key={item.id}
                className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Thumbnail */}
                <div className="relative h-36 bg-gray-100">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {type && <div className="absolute left-2 top-2">{typeBadge(type)}</div>}
                  {item.is_public ? (
                    <span className="absolute right-2 top-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Public
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                  {item.source && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <ExternalLink className="h-3 w-3" />
                      {item.source}
                    </p>
                  )}
                  {item.description && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-2">{item.description}</p>
                  )}
                  {item.category && (
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {item.category}
                    </p>
                  )}

                  <div className="mt-auto pt-4 flex gap-2">
                    {item.content_url && (
                      <a
                        href={item.content_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Preview
                      </a>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setImportTarget({ id: item.id, title: item.title })}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 transition"
                      >
                        <Import className="h-3.5 w-3.5" /> Import
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importTarget && (
        <ImportModal
          item={importTarget}
          onClose={() => setImportTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Modal — picks a target course + module for the selected library item
// ---------------------------------------------------------------------------

function ImportModal({
  item,
  onClose,
}: {
  item: { id: string; title: string };
  onClose: () => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");

  const { data: coursesData, isLoading: coursesLoading } = useCourses({ per_page: 100 });
  const { data: courseDetail, isLoading: courseLoading } = useCourse(courseId);
  const importMutation = useImportMarketplaceItem();

  const courses: any[] = useMemo(() => coursesData?.data ?? [], [coursesData]);
  const modules: any[] = useMemo(() => {
    const detail = (courseDetail?.data ?? courseDetail) as any;
    return detail?.modules ?? [];
  }, [courseDetail]);

  useEffect(() => {
    // reset module when course changes
    setModuleId("");
  }, [courseId]);

  const handleSubmit = async () => {
    if (!courseId || !moduleId) return;
    await toast.promise(
      importMutation.mutateAsync({ itemId: item.id, courseId, moduleId }),
      {
        loading: "Importing content…",
        success: "Content imported as a lesson!",
        error: (e: any) => e?.message ?? "Failed to import content",
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Import to Course</h2>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Target Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={coursesLoading}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            >
              <option value="">{coursesLoading ? "Loading courses…" : "Select a course"}</option>
              {courses.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Target Module</label>
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={!courseId || courseLoading}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            >
              <option value="">
                {!courseId
                  ? "Select a course first"
                  : courseLoading
                    ? "Loading modules…"
                    : modules.length === 0
                      ? "No modules in this course"
                      : "Select a module"}
              </option>
              {modules.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!courseId || !moduleId || importMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {importMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Import className="h-3.5 w-3.5" />
            )}
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
