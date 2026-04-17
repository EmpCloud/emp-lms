import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Users,
  Star,
  Play,
  FileText,
  Award,
  ChevronDown,
  CheckCircle2,
  Video,
  FileQuestion,
  MessageSquare,
  ShieldCheck,
  ArrowLeft,
  Settings,
  Upload,
  Archive,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  useCourse,
  useEnroll,
  useQuizzes,
  useDiscussions,
  useRatings,
} from "@/api/hooks";
import { apiPost } from "@/api/client";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";
import { formatDuration, formatDate, cn, progressColor } from "@/lib/utils";

/* ── Tabs ────────────────────────────────────────────────────────────────── */
const TABS = ["Modules & Lessons", "Quizzes", "Discussions", "Ratings"] as const;
type Tab = (typeof TABS)[number];

/* ── Star Row ────────────────────────────────────────────────────────────── */
function Stars({ rating, size = 4 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            `h-${size} w-${size}`,
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-gray-300",
          )}
        />
      ))}
    </span>
  );
}

/* ── Lesson icon ─────────────────────────────────────────────────────────── */
function LessonIcon({ type }: { type: string }) {
  switch (type) {
    case "video":
      return <Video className="h-4 w-4 text-indigo-500" />;
    case "quiz":
      return <FileQuestion className="h-4 w-4 text-amber-500" />;
    case "document":
      return <FileText className="h-4 w-4 text-sky-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-400" />;
  }
}

/* ── Module Accordion ────────────────────────────────────────────────────── */
function ModuleAccordion({
  module,
  defaultOpen,
}: {
  module: any;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lessons: any[] = module.lessons ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left transition hover:bg-gray-100"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition",
            open && "rotate-180",
          )}
        />
        <span className="flex-1 text-sm font-semibold text-gray-800">
          {module.title}
        </span>
        <span className="text-xs text-gray-500">
          {lessons.length} lesson{lessons.length !== 1 && "s"}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-gray-50">
          {lessons.map((lesson: any) => (
            <li
              key={lesson.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <LessonIcon type={lesson.type ?? "text"} />
              <span className="flex-1 text-gray-700">{lesson.title}</span>
              {lesson.duration != null && (
                <span className="text-xs text-gray-400">
                  {formatDuration(lesson.duration)}
                </span>
              )}
              {lesson.completed || lesson.is_completed || lesson.isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
              )}
            </li>
          ))}
          {lessons.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400">
              No lessons in this module.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ── Rating Distribution ─────────────────────────────────────────────────── */
function RatingDistribution({ ratings }: { ratings: any[] }) {
  const counts = [0, 0, 0, 0, 0];
  for (const r of ratings) counts[(r.rating ?? 1) - 1]++;
  const total = ratings.length || 1;
  const avg =
    ratings.reduce((s: number, r: any) => s + (r.rating ?? 0), 0) /
    (ratings.length || 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-4xl font-bold text-gray-900">
          {avg.toFixed(1)}
        </span>
        <div>
          <Stars rating={avg} size={5} />
          <p className="mt-1 text-sm text-gray-500">
            {ratings.length} rating{ratings.length !== 1 && "s"}
          </p>
        </div>
      </div>
      {[5, 4, 3, 2, 1].map((star) => (
        <div key={star} className="flex items-center gap-2 text-sm">
          <span className="w-3 text-gray-500">{star}</span>
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-amber-400"
              style={{ width: `${(counts[star - 1] / total) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-gray-400">
            {counts[star - 1]}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Page Skeleton ───────────────────────────────────────────────────────── */
function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-6 w-32 rounded bg-gray-200" />
      <div className="h-56 rounded-2xl bg-gray-200" />
      <div className="h-5 w-64 rounded bg-gray-200" />
      <div className="h-4 w-full rounded bg-gray-100" />
      <div className="h-4 w-3/4 rounded bg-gray-100" />
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(currentUser?.role);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Modules & Lessons");

  const { data: courseRes, isLoading } = useCourse(id!);
  const enroll = useEnroll();

  const publishCourse = useMutation({
    mutationFn: () => apiPost(`/courses/${id}/publish`, {}),
    onSuccess: () => {
      toast.success("Course published");
      qc.invalidateQueries({ queryKey: ["course", id] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to publish");
    },
  });

  const unpublishCourse = useMutation({
    mutationFn: () => apiPost(`/courses/${id}/unpublish`, {}),
    onSuccess: () => {
      toast.success("Course unpublished");
      qc.invalidateQueries({ queryKey: ["course", id] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to unpublish");
    },
  });
  const { data: quizzesRes } = useQuizzes(id!);
  const { data: discussionsRes } = useDiscussions(id!);
  const { data: ratingsRes } = useRatings(id!);

  const course = courseRes?.data;
  const quizzes: any[] = quizzesRes?.data ?? [];
  const discussions: any[] = discussionsRes?.data ?? [];
  const ratings: any[] = ratingsRes?.data ?? [];

  const isEnrolled = !!course?.enrollment;
  const progress = course?.enrollment?.progress ?? 0;
  const modules: any[] = course?.modules ?? [];

  function handleEnroll() {
    if (!id || !currentUser?.empcloudUserId) {
      toast.error("You must be logged in to enroll.");
      return;
    }
    enroll.mutate(
      { user_id: currentUser.empcloudUserId, course_id: id },
      {
        onSuccess: () => toast.success("Enrolled successfully!"),
        onError: (err: any) => {
          const msg = err?.response?.data?.error?.message || "Failed to enroll. Please try again.";
          toast.error(msg);
        },
      },
    );
  }

  if (isLoading) return <DetailSkeleton />;

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <BookOpen className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500">Course not found.</p>
        <Link
          to="/courses"
          className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to courses
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Thumbnail */}
          <div className="overflow-hidden rounded-2xl bg-gray-100">
            {course.thumbnailUrl ? (
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="h-64 w-full object-cover"
              />
            ) : (
              <div className="flex h-64 items-center justify-center bg-gradient-to-br from-indigo-50 to-sky-50">
                <BookOpen className="h-16 w-16 text-indigo-200" />
              </div>
            )}
          </div>

          {/* Title & meta */}
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {course.title}
          </h1>
          <p className="mt-2 text-gray-600">{course.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              {course.instructorName ?? course.instructor?.name ?? "Instructor"}
            </span>
            {course.difficulty && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  course.difficulty === "Advanced"
                    ? "bg-red-100 text-red-700"
                    : course.difficulty === "Intermediate"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700",
                )}
              >
                {course.difficulty}
              </span>
            )}
            {course.duration != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(course.duration)}
              </span>
            )}
            {course.rating != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {course.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Progress bar if enrolled */}
          {isEnrolled && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Progress</span>
                <span className="text-gray-500">{progress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn("h-full rounded-full transition-all", progressColor(progress))}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            {/* Enroll / Continue */}
            {isEnrolled ? (
              <Link
                to={`/courses/${id}/learn`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" />
                Continue Learning
              </Link>
            ) : (
              <button
                onClick={handleEnroll}
                disabled={enroll.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {enroll.isPending ? "Enrolling..." : "Enroll Now"}
              </button>
            )}

            {/* Admin actions */}
            {isAdmin && (
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium uppercase text-gray-400">Admin</p>
                <Link
                  to={`/courses/${id}/builder`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4" />
                  Manage Content
                </Link>
                {course?.status === "published" ? (
                  <button
                    type="button"
                    onClick={() => unpublishCourse.mutate()}
                    disabled={unpublishCourse.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Archive className="h-4 w-4" />
                    {unpublishCourse.isPending ? "Unpublishing..." : "Unpublish"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => publishCourse.mutate()}
                    disabled={publishCourse.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {publishCourse.isPending ? "Publishing..." : "Publish Course"}
                  </button>
                )}
                {course?.status && (
                  <p className="text-center text-xs text-gray-400">
                    Status: <span className="font-medium capitalize">{course.status}</span>
                  </p>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  Modules
                </span>
                <span className="font-medium">{modules.length}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  Enrolled
                </span>
                <span className="font-medium">
                  {course.enrollmentCount ?? 0}
                </span>
              </div>
              {course.passingScore != null && (
                <div className="flex items-center justify-between text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    <Award className="h-4 w-4 text-gray-400" />
                    Passing Score
                  </span>
                  <span className="font-medium">{course.passingScore}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Certificate info */}
          {course.certificateAvailable && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">
                  Certificate Available
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-600">
                Complete all modules to earn your certificate.
              </p>
            </div>
          )}

          {/* Compliance deadline */}
          {course.complianceDeadline && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">
                  Compliance Required
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-600">
                Deadline: {formatDate(course.complianceDeadline)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition",
                activeTab === t
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "Modules & Lessons" && (
        <div className="space-y-3">
          {modules.length > 0 ? (
            modules.map((m: any, i: number) => (
              <ModuleAccordion key={m.id ?? i} module={m} defaultOpen={i === 0} />
            ))
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              No modules available yet.
            </p>
          )}
        </div>
      )}

      {activeTab === "Quizzes" && (
        <div className="space-y-3">
          {quizzes.length > 0 ? (
            quizzes.map((q: any) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {q.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {q.questionCount ?? 0} questions
                    {q.timeLimit ? ` \u00b7 ${q.timeLimit} min` : ""}
                  </p>
                </div>
                <Link
                  to={`/quizzes/${q.id}`}
                  className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
                >
                  Start
                </Link>
              </div>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              No quizzes for this course.
            </p>
          )}
        </div>
      )}

      {activeTab === "Discussions" && (
        <div className="space-y-3">
          {discussions.length > 0 ? (
            discussions.map((d: any) => (
              <div
                key={d.id}
                className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 text-indigo-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {d.title ?? d.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {d.authorName ?? "Anonymous"}
                      {d.createdAt ? ` \u00b7 ${formatDate(d.createdAt)}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              No discussions yet.
            </p>
          )}
        </div>
      )}

      {activeTab === "Ratings" && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {ratings.length > 0 ? (
            <RatingDistribution ratings={ratings} />
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              No ratings yet. Be the first to rate this course!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
