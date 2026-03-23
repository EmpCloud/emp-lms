import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  BookOpen,
  Clock,
  BarChart3,
  Route,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLearningPaths, useEnroll } from "@/api/hooks";

const DIFFICULTY_OPTIONS = ["All", "Beginner", "Intermediate", "Advanced"] as const;

const difficultyColor: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-red-100 text-red-700",
};

export default function LearningPathListPage() {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<string>("All");

  const { data, isLoading, isError } = useLearningPaths();
  const enrollMutation = useEnroll();

  const paths: any[] = data?.data ?? [];

  const filtered = useMemo(() => {
    let items = paths;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
      );
    }
    if (difficulty !== "All") {
      items = items.filter(
        (p) => p.difficulty?.toLowerCase() === difficulty.toLowerCase(),
      );
    }
    return items;
  }, [paths, search, difficulty]);

  const handleEnroll = async (pathId: string) => {
    try {
      await enrollMutation.mutateAsync({ learning_path_id: pathId });
      toast.success("Enrolled in learning path!");
    } catch {
      toast.error("Failed to enroll. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20 text-red-600">
        Failed to load learning paths. Please try again later.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Learning Paths</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search learning paths..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {DIFFICULTY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "All" ? "All Difficulties" : opt}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20">
          <Route className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600">No learning paths found.</p>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((path: any) => (
            <div
              key={path.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 flex-1 mr-2">
                  {path.title}
                </h3>
                {path.difficulty && (
                  <span
                    className={`shrink-0 px-2.5 py-0.5 text-xs font-medium rounded-full ${
                      difficultyColor[path.difficulty.toLowerCase()] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {path.difficulty}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                {path.description ?? "No description available."}
              </p>

              <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-4">
                {path.course_count != null && (
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    {path.course_count} courses
                  </span>
                )}
                {path.estimated_duration != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {path.estimated_duration}h
                  </span>
                )}
              </div>

              {/* Progress (if enrolled) */}
              {path.progress != null && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium text-gray-900">{path.progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        path.progress >= 100 ? "bg-green-500" : "bg-blue-600"
                      }`}
                      style={{ width: `${Math.min(path.progress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-auto flex items-center gap-3">
                <Link
                  to={`/learning-paths/${path.id}`}
                  className="flex-1 text-center px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  View Details
                </Link>
                {path.progress == null && (
                  <button
                    onClick={() => handleEnroll(path.id)}
                    disabled={enrollMutation.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {enrollMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BarChart3 className="h-4 w-4" />
                    )}
                    Enroll
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
