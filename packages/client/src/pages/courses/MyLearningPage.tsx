import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, Calendar, Play, CheckCircle, Library } from "lucide-react";
import { useMyEnrollments } from "@/api/hooks";

type Tab = "in-progress" | "completed" | "all";

export default function MyLearningPage() {
  const [tab, setTab] = useState<Tab>("in-progress");
  const { data, isLoading, isError } = useMyEnrollments();

  const enrollments: any[] = data?.data ?? [];

  const filtered = useMemo(() => {
    if (tab === "in-progress") return enrollments.filter((e) => e.progress < 100);
    if (tab === "completed") return enrollments.filter((e) => e.progress >= 100);
    return enrollments;
  }, [enrollments, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "in-progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
  ];

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
        Failed to load your enrollments. Please try again later.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Learning</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20">
          <Library className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-4">You haven't enrolled in any courses yet.</p>
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Browse Catalog
          </Link>
        </div>
      )}

      {/* Cards grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((enrollment: any) => (
            <div
              key={enrollment.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-3 line-clamp-2">
                {enrollment.course_title ?? enrollment.course?.title ?? "Untitled Course"}
              </h3>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-500">Progress</span>
                  <span className="font-medium text-gray-900">{enrollment.progress ?? 0}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (enrollment.progress ?? 0) >= 100 ? "bg-green-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${Math.min(enrollment.progress ?? 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-col gap-1.5 text-sm text-gray-500 mb-4">
                {enrollment.time_spent != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {enrollment.time_spent} min spent
                  </span>
                )}
                {enrollment.last_accessed && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Last accessed {new Date(enrollment.last_accessed).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="mt-auto">
                {(enrollment.progress ?? 0) >= 100 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Completed
                  </span>
                ) : (
                  <Link
                    to={`/courses/${enrollment.course_id ?? enrollment.course?.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Continue
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
