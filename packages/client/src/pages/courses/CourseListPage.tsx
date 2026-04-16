import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Search,
  Filter,
  Plus,
  Clock,
  Users,
  Star,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { useCourses, useCategories, useDeleteCourse } from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";
import { formatDuration, cn } from "@/lib/utils";

const DIFFICULTIES = ["All", "Beginner", "Intermediate", "Advanced"] as const;
const TABS = ["All", "Published", "Draft"] as const;

/* ── Difficulty Badge ────────────────────────────────────────────────────── */
function DifficultyBadge({ level }: { level: string }) {
  const color =
    level === "Advanced"
      ? "bg-red-100 text-red-700"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-700"
        : "bg-green-100 text-green-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {level}
    </span>
  );
}

/* ── Star Rating ─────────────────────────────────────────────────────────── */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {rating?.toFixed(1) ?? "N/A"}
    </span>
  );
}

/* ── Course Card Skeleton ────────────────────────────────────────────────── */
function CardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="h-40 bg-gray-200" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
        <div className="flex gap-3">
          <div className="h-3 w-16 rounded bg-gray-100" />
          <div className="h-3 w-16 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function CourseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  /* Filters from URL */
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const difficulty = searchParams.get("difficulty") ?? "All";
  const tab = (searchParams.get("tab") ?? "All") as (typeof TABS)[number];
  const page = Number(searchParams.get("page") ?? "1");
  const limit = 12;

  /* Local search state (debounce-friendly) */
  const [searchInput, setSearchInput] = useState(search);

  /* Build query params */
  const queryParams = useMemo(() => {
    const p: Record<string, any> = { page, limit };
    if (search) p.search = search;
    if (category) p.category = category;
    if (difficulty !== "All") p.difficulty = difficulty.toLowerCase();
    if (tab === "Published") p.status = "published";
    else if (tab === "Draft") p.status = "draft";
    return p;
  }, [search, category, difficulty, tab, page, limit]);

  const { data: coursesRes, isLoading } = useCourses(queryParams);
  const { data: categoriesRes } = useCategories();
  const deleteCourse = useDeleteCourse();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const courses = coursesRes?.data ?? [];
  const meta = coursesRes?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const categories: any[] = categoriesRes?.data ?? [];

  /* ── helpers ───────────────────────────────────────────────────────── */
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "All") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page"); // reset page on filter change
    setSearchParams(next);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam("search", searchInput);
  }

  /* ── render ────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse and manage learning content.
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/courses/new"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Course
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm md:flex-row md:items-center">
        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search courses..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </form>

        {/* Category */}
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={category}
            onChange={(e) => setParam("category", e.target.value)}
            className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-8 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Categories</option>
            {categories
              .filter((c: any) => c && typeof c === "object" && c.id)
              .map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        {/* Difficulty */}
        <select
          value={difficulty}
          onChange={(e) => setParam("difficulty", e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d === "All" ? "All Levels" : d}
            </option>
          ))}
        </select>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParam("tab", t)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition",
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : Array.isArray(courses) && courses.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses
            .filter((course: any) => course && typeof course === "object" && course.id)
            .map((course: any) => (
            <div
              key={course.id}
              className="group relative overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md"
            >
              <Link
                to={`/courses/${course.id}`}
                className="block"
              >
                {/* Thumbnail */}
                <div className="relative h-40 overflow-hidden bg-gray-100">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-sky-50">
                      <BookOpen className="h-10 w-10 text-indigo-300" />
                    </div>
                  )}
                  {course.difficulty && (
                    <div className="absolute left-2 top-2">
                      <DifficultyBadge level={course.difficulty} />
                    </div>
                  )}
                </div>
              </Link>

              {/* Admin actions overlay */}
              {isAdmin && (
                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/courses/${course.id}/edit`);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-gray-700 shadow-sm hover:bg-indigo-50 hover:text-indigo-600"
                    title="Edit course"
                    aria-label={`Edit ${course.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget({ id: course.id, title: course.title });
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-gray-700 shadow-sm hover:bg-red-50 hover:text-red-600"
                    title="Delete course"
                    aria-label={`Delete ${course.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}

              <Link
                to={`/courses/${course.id}`}
                className="block"
              >

              {/* Body */}
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-indigo-600">
                  {course.title}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {course.instructorName ?? course.instructor?.name ?? "Instructor"}
                </p>

                {/* Meta row */}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {course.duration != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(course.duration)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {course.enrollmentCount ?? 0}
                  </span>
                  {course.rating != null && (
                    <StarRating rating={course.rating} />
                  )}
                </div>
              </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 shadow-sm">
          <FolderOpen className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-700">
            No courses found
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            Try adjusting your filters or search term.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <span className="px-3 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>

          <button
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteCourse.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete course</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Delete <span className="font-medium text-gray-700">{deleteTarget.title}</span>?
                    Enrollments, progress, and certificates tied to this course may be affected.
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteCourse.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  deleteCourse.mutate(deleteTarget.id, {
                    onSuccess: () => {
                      toast.success("Course deleted");
                      setDeleteTarget(null);
                    },
                    onError: (err: any) => {
                      toast.error(err?.response?.data?.error?.message || "Failed to delete course");
                    },
                  })
                }
                disabled={deleteCourse.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCourse.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
