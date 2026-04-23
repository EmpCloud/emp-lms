import { useMemo, useState, useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useCourse, useMarkLessonComplete } from "@/api/hooks";
import { LessonPlayer } from "@/components/lesson-player/LessonPlayer";

/**
 * Sprint 1: Learner runtime. Reached via /courses/:id/learn after the user
 * enrolls in a course. Shows the module tree in a sidebar, plays the current
 * lesson, and marks it complete so enrollment.progress_percentage advances.
 *
 * The server-side markLessonComplete() endpoint already exists and handles
 * the upsert into lesson_progress + % recalc + auto-complete at 100%. This
 * page only drives it from the client.
 */
export default function LearnerRuntimePage() {
  const { id: courseId } = useParams<{ id: string }>();
  const { data: courseRes, isLoading, isError } = useCourse(courseId!);
  const course = courseRes?.data;

  // Flatten modules → lessons in order so we can step through with prev/next.
  const lessons = useMemo(() => {
    if (!course?.modules) return [];
    const mods = [...course.modules].sort(
      (a: any, b: any) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0),
    );
    return mods.flatMap((m: any) =>
      [...(m.lessons ?? [])]
        .sort(
          (a: any, b: any) =>
            (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0),
        )
        .map((l: any) => ({ ...l, moduleTitle: m.title, moduleId: m.id })),
    );
  }, [course]);

  const enrollment = course?.enrollment;
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  // Pick a sensible starting lesson: first not-yet-completed, else first.
  useEffect(() => {
    if (activeLessonId || lessons.length === 0) return;
    const firstIncomplete = lessons.find((l: any) => !l.is_completed && !l.isCompleted);
    setActiveLessonId(firstIncomplete?.id ?? lessons[0].id);
  }, [lessons, activeLessonId]);

  const markComplete = useMarkLessonComplete(enrollment?.id ?? "");

  // Client-side derived "completed" set — MUST be declared before any early
  // return so React's hook order stays stable across renders (fixes the
  // "change in the order of Hooks" error).
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set<string>());

  // Merge server-reported completion status into the local set. Uses merge
  // (additive) instead of replace so optimistic updates from handleComplete
  // aren't wiped when react-query refetches after invalidation. The API
  // doesn't always return is_completed per lesson, so any IDs already in
  // the set from a successful mark-complete call are preserved.
  useEffect(() => {
    if (lessons.length === 0) return;
    setCompletedIds((prev) => {
      const merged = new Set(prev);
      for (const l of lessons) {
        if (l.is_completed || l.isCompleted) merged.add(l.id);
      }
      return merged;
    });
  }, [lessons]);

  // Guard: unenrolled users bounce back to the detail page where they can enroll.
  if (!isLoading && course && !enrollment) {
    return <Navigate to={`/courses/${courseId}`} replace />;
  }

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">
          Failed to load course.{" "}
          <Link to="/courses" className="text-indigo-600 hover:underline">
            Back to courses
          </Link>
        </p>
      </div>
    );
  }

  const activeLesson = lessons.find((l: any) => l.id === activeLessonId);
  const activeIdx = lessons.findIndex((l: any) => l.id === activeLessonId);
  const nextLesson = activeIdx >= 0 && activeIdx < lessons.length - 1 ? lessons[activeIdx + 1] : null;

  const handleComplete = (lessonId: string, timeSpentSec?: number) => {
    if (!enrollment?.id) return;
    if (completedIds.has(lessonId)) {
      // Already complete; just move to next
      if (nextLesson) setActiveLessonId(nextLesson.id);
      return;
    }
    markComplete.mutate(
      { lessonId, time_spent: timeSpentSec ? Math.round(timeSpentSec / 60) : 0 },
      {
        onSuccess: (res: any) => {
          setCompletedIds((prev) => new Set(prev).add(lessonId));
          const pct = res?.data?.progress_percentage ?? res?.progress_percentage;
          if (res?.data?.is_course_completed || res?.is_course_completed) {
            toast.success("🎉 Course complete!");
          } else {
            toast.success(`Lesson complete — ${pct ?? 0}% done`);
          }
          if (nextLesson) setActiveLessonId(nextLesson.id);
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.error?.message || "Failed to mark lesson complete");
        },
      },
    );
  };

  const totalLessons = lessons.length;
  const doneCount = completedIds.size;
  const pct = totalLessons ? Math.round((doneCount / totalLessons) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            to={`/courses/${courseId}`}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to course
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{course.title}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Progress</div>
          <div className="text-lg font-semibold text-gray-900">{pct}%</div>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sidebar — module / lesson list */}
        <aside className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Course Contents</h2>
            <div className="space-y-4">
              {[...course.modules]
                .sort(
                  (a: any, b: any) =>
                    (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0),
                )
                .map((mod: any) => (
                  <div key={mod.id}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {mod.title}
                    </p>
                    <ul className="space-y-0.5">
                      {[...(mod.lessons ?? [])]
                        .sort(
                          (a: any, b: any) =>
                            (a.sortOrder ?? a.sort_order ?? 0) -
                            (b.sortOrder ?? b.sort_order ?? 0),
                        )
                        .map((lesson: any) => {
                          const active = lesson.id === activeLessonId;
                          const done = completedIds.has(lesson.id);
                          return (
                            <li key={lesson.id}>
                              <button
                                type="button"
                                onClick={() => setActiveLessonId(lesson.id)}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                                  active
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {done ? (
                                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
                                ) : (
                                  <Circle className="h-4 w-4 flex-shrink-0 text-gray-300" />
                                )}
                                <span className="truncate">{lesson.title}</span>
                                {active && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        </aside>

        {/* Main — active lesson player */}
        <main className="lg:col-span-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            {activeLesson ? (
              <LessonPlayer
                key={activeLesson.id}
                lesson={activeLesson}
                isCompleted={completedIds.has(activeLesson.id)}
                onComplete={(timeSpentSec) => handleComplete(activeLesson.id, timeSpentSec)}
                saving={markComplete.isPending}
              />
            ) : (
              <p className="py-12 text-center text-gray-400">
                No lessons in this course yet. Ask an admin to add content in the Course Builder.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
