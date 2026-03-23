import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Users,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarDays,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";
import { useCourses } from "@/api/hooks";
import { apiPost } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

interface BulkEnrollResult {
  success_count?: number;
  successCount?: number;
  already_enrolled_count?: number;
  alreadyEnrolledCount?: number;
  failure_count?: number;
  failureCount?: number;
  failures?: { user_id: string; reason: string }[];
}

export default function BulkEnrollPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [userIdsText, setUserIdsText] = useState("");
  const [enrollAll, setEnrollAll] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkEnrollResult | null>(null);

  const { data: coursesRes, isLoading: coursesLoading } = useCourses();
  const courses = coursesRes?.data ?? [];

  // Redirect non-admins
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Parse user IDs from text input
  const parsedUserIds = userIdsText
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const enrollCount = enrollAll ? "all users" : `${parsedUserIds.length} user(s)`;
  const canSubmit =
    selectedCourseId && (enrollAll || parsedUserIds.length > 0) && !submitting;

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);

    try {
      const body: any = {
        course_id: selectedCourseId,
      };
      if (enrollAll) {
        body.enroll_all = true;
      } else {
        body.user_ids = parsedUserIds;
      }
      if (dueDate) {
        body.due_date = dueDate;
      }

      const res = await apiPost<BulkEnrollResult>("/enrollments/bulk", body);

      if (res.success && res.data) {
        setResult(res.data);
        const successCount = res.data.success_count ?? res.data.successCount ?? 0;
        toast.success(`Successfully enrolled ${successCount} user(s)`);
      } else {
        toast.error(res.error?.message ?? "Bulk enrollment failed");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ?? "Bulk enrollment request failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const successCount = result
    ? (result.success_count ?? result.successCount ?? 0)
    : 0;
  const alreadyCount = result
    ? (result.already_enrolled_count ?? result.alreadyEnrolledCount ?? 0)
    : 0;
  const failureCount = result
    ? (result.failure_count ?? result.failureCount ?? 0)
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-7 w-7 text-brand-600" />
          Bulk Enrollment
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Enroll multiple users into a course at once
        </p>
      </div>

      <form onSubmit={handleEnroll} className="space-y-6">
        {/* Course selector */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <label
              htmlFor="bulk-course-select"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Course
            </label>
            <select
              id="bulk-course-select"
              value={selectedCourseId}
              onChange={(e) => {
                setSelectedCourseId(e.target.value);
                setResult(null);
              }}
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">-- Select a course --</option>
              {coursesLoading && <option disabled>Loading courses...</option>}
              {(Array.isArray(courses) ? courses : []).map((c: any) => (
                <option key={c.id ?? c._id} value={c.id ?? c._id}>
                  {c.title ?? c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Enroll All checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enroll-all"
              checked={enrollAll}
              onChange={(e) => {
                setEnrollAll(e.target.checked);
                if (e.target.checked) setUserIdsText("");
              }}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="enroll-all" className="text-sm font-medium text-gray-700">
              Enroll all users in the organization
            </label>
          </div>

          {/* User IDs textarea */}
          {!enrollAll && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User IDs
              </label>
              <textarea
                value={userIdsText}
                onChange={(e) => setUserIdsText(e.target.value)}
                placeholder={"Enter user IDs separated by commas or new lines:\n101\n102\n103"}
                rows={5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Separate IDs with commas or line breaks
              </p>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
              <CalendarDays className="h-4 w-4" />
              Due Date (optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Enrollment Preview</p>
            <p className="mt-1">
              {selectedCourseId
                ? `Ready to enroll ${enrollCount} into the selected course.`
                : "Select a course and specify users to preview enrollment."}
            </p>
            {!enrollAll && parsedUserIds.length > 0 && (
              <p className="mt-1 text-xs text-blue-600">
                IDs: {parsedUserIds.slice(0, 10).join(", ")}
                {parsedUserIds.length > 10 &&
                  ` ... and ${parsedUserIds.length - 10} more`}
              </p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {submitting ? "Enrolling..." : "Enroll"}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Enrollment Results</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-green-600" />
              <p className="mt-1 text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Successfully Enrolled</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <Info className="mx-auto h-6 w-6 text-amber-600" />
              <p className="mt-1 text-2xl font-bold text-amber-700">{alreadyCount}</p>
              <p className="text-xs text-amber-600 font-medium">Already Enrolled</p>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
              <p className="mt-1 text-2xl font-bold text-red-700">{failureCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          </div>

          {/* Failure details */}
          {result.failures && result.failures.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Failure Details</h3>
              <div className="rounded-md border border-red-200 bg-red-50 divide-y divide-red-100 max-h-48 overflow-y-auto">
                {result.failures.map((f, i) => (
                  <div key={i} className="px-3 py-2 text-sm">
                    <span className="font-mono font-medium text-red-700">
                      {f.user_id}
                    </span>
                    <span className="text-red-600 ml-2">- {f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
