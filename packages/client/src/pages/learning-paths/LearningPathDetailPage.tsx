// ---------------------------------------------------------------------------
// Learning Path Detail — Journey Timeline (Phase 1)
//
// Shows the path header with a progress ring, then a vertical timeline of
// courses the learner steps through sequentially. Each course is a clickable
// card showing status (completed / in-progress / available / locked).
// ---------------------------------------------------------------------------

import { useParams, Link } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Lock,
  CheckCircle,
  CircleDot,
  Play,
  Award,
  ArrowLeft,
  Loader2,
  Star,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLearningPath, useEnrollInPath } from "@/api/hooks";

const difficultyColor: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-orange-100 text-orange-700",
  expert: "bg-red-100 text-red-700",
};

function statusIcon(status?: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-6 w-6 text-green-500" />;
    case "in_progress":
    case "in-progress":
    case "available":
      return <CircleDot className="h-6 w-6 text-blue-500" />;
    case "locked":
    default:
      return <Lock className="h-6 w-6 text-gray-300" />;
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
    case "in-progress":
      return "In Progress";
    case "available":
      return "Available";
    default:
      return "Locked";
  }
}

function statusAction(status?: string) {
  switch (status) {
    case "completed":
      return "Review";
    case "in_progress":
    case "in-progress":
      return "Continue";
    case "available":
      return "Start";
    default:
      return null;
  }
}

export default function LearningPathDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useLearningPath(id!);
  const enrollMutation = useEnrollInPath();

  const path: any = data?.data ?? null;

  const handleEnroll = async () => {
    try {
      await enrollMutation.mutateAsync(id!);
      toast.success("Enrolled in learning path!");
    } catch {
      toast.error("Failed to enroll");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isError || !path) {
    return (
      <div className="text-center py-20 text-red-600">
        Failed to load learning path.
      </div>
    );
  }

  const courses: any[] = path.courses ?? [];
  const progress: number = path.progress ?? 0;
  const isEnrolled = path.enrolled === true || path.progress != null;
  const isCompleted = progress >= 100;
  const courseCount = path.course_count ?? courses.length;
  const duration = path.total_duration ?? path.estimated_duration_minutes;
  const completedCount = courses.filter((c: any) => c.status === "completed").length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <Link
        to="/learning-paths"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Learning Paths
      </Link>

      {/* Hero header */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Left: info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {path.is_mandatory && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  <Star className="h-3 w-3" /> Required
                </span>
              )}
              {path.difficulty && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    difficultyColor[path.difficulty.toLowerCase()] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {path.difficulty}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">{path.title}</h1>
            <p className="text-gray-600 mb-4">{path.description}</p>

            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" /> {courseCount} courses
              </span>
              {duration != null && duration > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />{" "}
                  {duration >= 60 ? `${Math.round(duration / 60)}h` : `${duration}m`}
                </span>
              )}
              {path.enrollment_count != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> {path.enrollment_count} enrolled
                </span>
              )}
            </div>

            {!isEnrolled && (
              <button
                onClick={handleEnroll}
                disabled={enrollMutation.isPending}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {enrollMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Enroll in Path
              </button>
            )}
          </div>

          {/* Right: progress ring */}
          {isEnrolled && (
            <div className="flex flex-col items-center shrink-0">
              <ProgressRing progress={progress} size={120} />
              <p className="text-sm text-gray-500 mt-2">
                {completedCount} of {courseCount} completed
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Certificate callout */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-5 mb-6 flex items-center gap-4">
          <Award className="h-10 w-10 text-yellow-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">Path Complete!</h3>
            <p className="text-sm text-gray-600">
              Congratulations — you've finished all courses in this learning path.
            </p>
          </div>
        </div>
      )}

      {/* Course timeline */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Course Roadmap
      </h2>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {courses.map((course: any, idx: number) => {
            const status: string = course.status ?? "locked";
            const isLocked = status === "locked";
            const action = statusAction(status);
            const courseId = course.id ?? course.course_id;

            return (
              <div key={courseId ?? idx} className="relative flex items-start gap-4 pl-0">
                {/* Timeline node */}
                <div className="relative z-10 flex items-center justify-center h-12 w-12 shrink-0">
                  <div
                    className={`flex items-center justify-center h-12 w-12 rounded-full border-2 ${
                      status === "completed"
                        ? "border-green-300 bg-green-50"
                        : status === "in_progress" || status === "in-progress" || status === "available"
                          ? "border-blue-300 bg-blue-50"
                          : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    {statusIcon(status)}
                  </div>
                </div>

                {/* Course card */}
                <div
                  className={`flex-1 bg-white border rounded-xl p-4 transition-all ${
                    isLocked
                      ? "border-gray-100 opacity-60"
                      : "border-gray-200 hover:shadow-md hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-mono">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <h3 className="font-medium text-gray-900 truncate">
                          {course.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {course.duration_minutes != null && course.duration_minutes > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {course.duration_minutes >= 60
                              ? `${Math.round(course.duration_minutes / 60)}h`
                              : `${course.duration_minutes}m`}
                          </span>
                        )}
                        {/* Also handle the `duration` key for backward compat */}
                        {course.duration != null && !course.duration_minutes && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {course.duration}h
                          </span>
                        )}
                        {course.difficulty && (
                          <span
                            className={`px-1.5 py-0.5 rounded font-medium ${
                              difficultyColor[course.difficulty.toLowerCase()] || ""
                            }`}
                          >
                            {course.difficulty}
                          </span>
                        )}
                        <span
                          className={`font-medium ${
                            status === "completed"
                              ? "text-green-600"
                              : status === "locked"
                                ? "text-gray-400"
                                : "text-blue-600"
                          }`}
                        >
                          {statusLabel(status)}
                        </span>
                      </div>
                    </div>

                    {action && courseId && (
                      <Link
                        to={
                          status === "completed" || status === "in_progress" || status === "in-progress"
                            ? `/courses/${courseId}/learn`
                            : `/courses/${courseId}`
                        }
                        className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          status === "completed"
                            ? "text-green-700 bg-green-50 hover:bg-green-100"
                            : "text-white bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {action}
                      </Link>
                    )}
                    {isLocked && (
                      <span className="shrink-0 text-xs text-gray-400 font-medium px-3 py-2">
                        Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Ring — SVG donut showing path completion %
// ---------------------------------------------------------------------------

function ProgressRing({ progress, size = 120 }: { progress: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  const isComplete = progress >= 100;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? "#22c55e" : "#3b82f6"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{Math.round(progress)}%</span>
        <span className="text-[10px] text-gray-500">Complete</span>
      </div>
    </div>
  );
}
