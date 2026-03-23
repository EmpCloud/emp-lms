import { useState } from "react";
import { Store, Search, Import, Loader2, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { useMarketplace } from "@/api/hooks";
import { apiPost } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "scorm", label: "SCORM" },
  { value: "video", label: "Video" },
  { value: "article", label: "Article" },
  { value: "course", label: "Course" },
  { value: "webinar", label: "Webinar" },
];

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    scorm: "bg-purple-100 text-purple-700",
    video: "bg-blue-100 text-blue-700",
    article: "bg-green-100 text-green-700",
    course: "bg-indigo-100 text-indigo-700",
    webinar: "bg-amber-100 text-amber-700",
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
  const isAdmin = user?.role === "admin" || user?.role === "org_admin";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const params: Record<string, any> = {};
  if (search) params.search = search;
  if (typeFilter !== "all") params.type = typeFilter;

  const { data, isLoading } = useMarketplace(params);
  const items: any[] = data?.data ?? [];

  const handleImport = async (itemId: string) => {
    try {
      toast.loading("Importing content\u2026", { id: "import" });
      await apiPost("/marketplace/import", { itemId });
      toast.success("Content imported as a new course!", { id: "import" });
    } catch {
      toast.error("Failed to import content", { id: "import" });
    }
  };

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
            placeholder="Search marketplace\u2026"
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
          {items.map((item: any) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
            >
              {/* Thumbnail */}
              <div className="relative h-36 bg-gray-100">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Store className="h-10 w-10 text-gray-300" />
                  </div>
                )}
                <div className="absolute left-2 top-2">{typeBadge(item.type)}</div>
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

                <div className="mt-auto pt-4">
                  {isAdmin && (
                    <button
                      onClick={() => handleImport(item.id)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 transition"
                    >
                      <Import className="h-3.5 w-3.5" /> Import to Course
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
