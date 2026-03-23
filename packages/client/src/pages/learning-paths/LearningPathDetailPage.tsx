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
} from "lucide-react";
import toast from "react-hot-toast";
import { useLearningPath, useEnroll } from "@/api/hooks";

const difficultyColor: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-red-100 text-red-700",
};

function statusIcon(status?: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "available":
    case "in-progress":
      return <CircleDot className="h-5 w-5 text-blue-500" />;
    case "locked":
    default:
      return <Lock className="h-5 w-5 text-gray-400" />;
  }
}

export default function LearningPathDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useLearningPath(id!);
  const enrollMutation = useEnroll();

  const path: any = data?.data ?? null;

  const handleEnroll = async () => {
    try {
      await enrollMutation.mutateAsync({ learning_path_id: id });
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

  if (isError || !path) {
    return (
      <div className="text-center py-20 text-red-600">
        Failed to load learning path. Please try again.
      </div>
    );
  }

  const courses: any[] = path.courses ?? [];
  const progress: number = path.progress ?? 0;
  const isEnrolled = path.enrolled === true || path.progress != null;
  const isCompleted = progress >= 100;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        to="/learning-paths"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Learning Paths
      </Link>

      {/* Header */}
      <div className="bg-white border rounded-xl p-6 shadow-sm mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{path.title}</h1>
        <p className="text-gray-600 mb-5">{path.description}</p>

        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-5">
          {path.course_count != null && (
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {path.course_count ?? courses.length} courses
            </span>
          )}
          {path.total_duration != null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {path.total_duration}h total
            </span>
          )}
          {path.difficulty && (
            <span
              className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                difficultyColor[path.difficulty.toLowerCase()] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {path.difficulty}
            </span>
          )}
        </div>

        {/* Overall progress bar */}
        {isEnrolled && (
          <div className="mb-5">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">Overall Progress</span>
              <span className="font-medium text-gray-900">{progress}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isCompleted ? "bg-green-500" : "bg-blue-600"
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Enroll button */}
        {!isEnrolled && (
          <button
            onClick={handleEnroll}
            disabled={enrollMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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

      {/* Certificate section */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-6 mb-6 flex items-center gap-4">
          <Award className="h-10 w-10 text-yellow-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">Certificate Earned</h3>
            <p className="text-sm text-gray-600">
              Congratulations! You have completed this learning path.
            </p>
            {path.certificate_url && (
              <a
                href={path.certificate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline mt-1 inline-block"
              >
                View Certificate
              </a>
            )}
          </div>
        </div>
      )}

      {/* Course list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Courses ({courses.length})
        </h2>
        {courses.map((course: any, index: number) => {
          const status: string = course.status ?? "locked";
          const isLocked = status === "locked";
          return (
            <div
              key={course.id ?? index}
              className={`bg-white border rounded-xl p-4 flex items-center gap-4 transition-shadow ${
                isLocked ? "opacity-60" : "hover:shadow-md"
              }`}
            >
              {/* Order number */}
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 text-sm font-semibold text-gray-600 shrink-0">
                {index + 1}
              </div>

              {/* Status icon */}
              <div className="shrink-0">{statusIcon(status)}</div>

              {/* Course info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">{course.title}</h3>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                  {course.duration != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {course.duration}h
                    </span>
                  )}
                  {course.difficulty && (
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        difficultyColor[course.difficulty.toLowerCase()] ??
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {course.difficulty}
                    </span>
                  )}
                </div>
              </div>

              {/* Action button */}
              {!isLocked && (
                <Link
                  to={`/courses/${course.id ?? course.course_id}`}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  {status === "completed" ? "Review" : status === "in-progress" ? "Continue" : "Start"}
                </Link>
              )}
              {isLocked && (
                <span className="shrink-0 text-xs text-gray-400 font-medium">Locked</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
