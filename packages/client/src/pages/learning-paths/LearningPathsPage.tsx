// ---------------------------------------------------------------------------
// Learning Paths — Catalog + Admin Builder (Phase 1)
//
// For all users: browse paths, filter by difficulty, search, enroll.
// For admins: create/edit paths, add/remove courses, publish.
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  BookOpen,
  Clock,
  Route,
  Loader2,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Star,
  X,
  Trash2,
  GripVertical,
  Send,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  useLearningPaths,
  useCourses,
  useCreateLearningPath,
  useUpdateLearningPath,
  usePublishLearningPath,
  useDeleteLearningPath,
  useAddCourseToPath,
  useRemoveCourseFromPath,
  useEnrollInPath,
  useLearningPath,
} from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

const DIFFICULTIES = ["All", "beginner", "intermediate", "advanced", "expert"] as const;

const difficultyColor: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-orange-100 text-orange-700",
  expert: "bg-red-100 text-red-700",
};

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-green-100 text-green-700",
  archived: "bg-red-100 text-red-600",
};

export default function LearningPathsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingPath, setEditingPath] = useState<any>(null);

  const { data, isLoading } = useLearningPaths();
  const enrollMutation = useEnrollInPath();

  const allPaths: any[] = data?.data ?? [];

  // Admins see all statuses; employees see only published
  const paths = useMemo(() => {
    let items = isAdmin ? allPaths : allPaths.filter((p) => p.status === "published");
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) => p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
      );
    }
    if (difficulty !== "All") {
      items = items.filter((p) => p.difficulty?.toLowerCase() === difficulty.toLowerCase());
    }
    return items;
  }, [allPaths, search, difficulty, isAdmin]);

  const mandatory = paths.filter((p) => p.is_mandatory);
  const regular = paths.filter((p) => !p.is_mandatory);

  const handleEnroll = async (pathId: string) => {
    try {
      await enrollMutation.mutateAsync(pathId);
      toast.success("Enrolled in learning path!");
    } catch {
      toast.error("Failed to enroll");
    }
  };

  const openCreate = () => {
    setEditingPath(null);
    setShowBuilder(true);
  };

  const openEdit = (path: any) => {
    setEditingPath(path);
    setShowBuilder(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning Paths</h1>
          <p className="text-gray-500 mt-1">
            Guided course sequences to build skills step-by-step.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Create Path
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search learning paths..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                difficulty === d
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {d === "All" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Mandatory paths */}
      {mandatory.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide">
              Required Paths
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mandatory.map((path) => (
              <PathCard
                key={path.id}
                path={path}
                isAdmin={isAdmin}
                onEnroll={handleEnroll}
                onEdit={openEdit}
                enrollPending={enrollMutation.isPending}
                mandatory
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {regular.length === 0 && mandatory.length === 0 && (
        <div className="text-center py-20">
          <Route className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">
            {search || difficulty !== "All"
              ? "No paths match your filters."
              : "No learning paths yet."}
          </p>
          {isAdmin && !search && difficulty === "All" && (
            <button
              onClick={openCreate}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Create the first learning path
            </button>
          )}
        </div>
      )}

      {/* Regular paths */}
      {regular.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {regular.map((path) => (
            <PathCard
              key={path.id}
              path={path}
              isAdmin={isAdmin}
              onEnroll={handleEnroll}
              onEdit={openEdit}
              enrollPending={enrollMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Admin builder modal */}
      {showBuilder && (
        <PathBuilder
          path={editingPath}
          onClose={() => {
            setShowBuilder(false);
            setEditingPath(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path Card
// ---------------------------------------------------------------------------

function PathCard({
  path,
  isAdmin,
  onEnroll,
  onEdit,
  enrollPending,
  mandatory,
}: {
  path: any;
  isAdmin: boolean;
  onEnroll: (id: string) => void;
  onEdit: (p: any) => void;
  enrollPending: boolean;
  mandatory?: boolean;
}) {
  const progress: number | null = path.progress ?? null;
  const isEnrolled = progress !== null;
  const isCompleted = progress !== null && progress >= 100;
  const courseCount = path.course_count ?? path.courses?.length ?? 0;
  const duration = path.estimated_duration_minutes ?? path.estimated_duration ?? path.total_duration;

  return (
    <div
      className={`bg-white border rounded-xl p-5 flex flex-col transition-shadow hover:shadow-md ${
        mandatory ? "border-red-200 ring-1 ring-red-100" : "border-gray-200"
      }`}
    >
      {/* Badges */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {mandatory && (
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
        {isAdmin && path.status && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              statusColor[path.status] || "bg-gray-100"
            }`}
          >
            {path.status}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold text-gray-900 line-clamp-2 mb-2">{path.title}</h3>
      <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">
        {path.description || "No description"}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
        <span className="inline-flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" /> {courseCount} courses
        </span>
        {duration != null && duration > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />{" "}
            {duration >= 60 ? `${Math.round(duration / 60)}h` : `${duration}m`}
          </span>
        )}
      </div>

      {/* Progress */}
      {isEnrolled && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">{isCompleted ? "Completed" : "In progress"}</span>
            <span className="font-semibold text-gray-900">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isCompleted ? "bg-green-500" : "bg-blue-600"}`}
              style={{ width: `${Math.min(progress!, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        <Link
          to={`/learning-paths/${path.id}`}
          className="flex-1 text-center px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
        >
          {isEnrolled ? (isCompleted ? "Review" : "Continue") : "View Details"}
        </Link>
        {!isEnrolled && (
          <button
            onClick={() => onEnroll(path.id)}
            disabled={enrollPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {enrollPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Enroll
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => onEdit(path)}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path Builder (Create / Edit modal with 2-step flow)
// ---------------------------------------------------------------------------

function PathBuilder({ path, onClose }: { path: any; onClose: () => void }) {
  const isNew = !path;
  const [title, setTitle] = useState(path?.title || "");
  const [description, setDescription] = useState(path?.description || "");
  const [difficulty, setDifficulty] = useState(path?.difficulty || "beginner");
  const [isMandatory, setIsMandatory] = useState(path?.is_mandatory || false);
  const [step, setStep] = useState<"details" | "courses">(isNew ? "details" : "courses");
  const [createdId, setCreatedId] = useState<string | null>(path?.id || null);
  const [showCoursePicker, setShowCoursePicker] = useState(false);

  const createMut = useCreateLearningPath();
  const updateMut = useUpdateLearningPath(createdId || "");
  const publishMut = usePublishLearningPath();
  const deleteMut = useDeleteLearningPath();

  // Fetch the path with its courses when we have an id
  const { data: freshPath } = useLearningPath(createdId || "");
  const pathCourses: any[] = freshPath?.data?.courses || path?.courses || [];
  const currentStatus = freshPath?.data?.status || path?.status;

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      if (createdId) {
        await updateMut.mutateAsync({ title, description, difficulty, is_mandatory: isMandatory });
        toast.success("Path updated");
      } else {
        const res: any = await createMut.mutateAsync({ title, description, difficulty, is_mandatory: isMandatory });
        const newId = res?.data?.id || res?.id;
        setCreatedId(newId);
        toast.success("Path created — now add courses");
      }
      setStep("courses");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Failed to save");
    }
  };

  const handlePublish = async () => {
    if (!createdId) return;
    try {
      await publishMut.mutateAsync(createdId);
      toast.success("Path published!");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Add at least 1 course before publishing");
    }
  };

  const handleDelete = async () => {
    if (!createdId || !confirm("Archive this learning path?")) return;
    try {
      await deleteMut.mutateAsync(createdId);
      toast.success("Path archived");
      onClose();
    } catch {
      toast.error("Failed to archive");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isNew && !createdId ? "Create Learning Path" : "Edit Learning Path"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setStep("details")}
                className={`text-xs font-medium px-2 py-0.5 rounded ${step === "details" ? "bg-blue-100 text-blue-700" : "text-gray-400"}`}
              >
                1. Details
              </button>
              <span className="text-gray-300">→</span>
              <button
                onClick={() => createdId && setStep("courses")}
                className={`text-xs font-medium px-2 py-0.5 rounded ${step === "courses" ? "bg-blue-100 text-blue-700" : "text-gray-400"} ${!createdId ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                2. Courses
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "details" && (
            <form id="path-details-form" onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Frontend Developer Track"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What will learners achieve by completing this path?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMandatory}
                      onChange={(e) => setIsMandatory(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-700">Mandatory for all employees</span>
                  </label>
                </div>
              </div>
            </form>
          )}

          {step === "courses" && createdId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Courses in this path ({pathCourses.length})
                </h3>
                <button
                  onClick={() => setShowCoursePicker(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Course
                </button>
              </div>

              {pathCourses.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <BookOpen className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No courses yet. Click "Add Course" to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pathCourses.map((course: any, idx: number) => (
                    <PathCourseRow
                      key={course.id || course.course_id}
                      course={course}
                      index={idx}
                      pathId={createdId}
                    />
                  ))}
                </div>
              )}

              {showCoursePicker && (
                <CoursePicker
                  pathId={createdId}
                  existingCourseIds={pathCourses.map((c: any) => c.id || c.course_id)}
                  onClose={() => setShowCoursePicker(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div>
            {createdId && (
              <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700">
                Archive Path
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-white">
              {createdId ? "Close" : "Cancel"}
            </button>
            {step === "details" && (
              <button
                type="submit"
                form="path-details-form"
                disabled={createMut.isPending || updateMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {createdId ? "Save Changes" : "Create & Continue"}
              </button>
            )}
            {step === "courses" && createdId && currentStatus !== "published" && (
              <button
                onClick={handlePublish}
                disabled={publishMut.isPending || pathCourses.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {publishMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publish Path
              </button>
            )}
            {step === "courses" && currentStatus === "published" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Published
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path Course Row
// ---------------------------------------------------------------------------

function PathCourseRow({ course, index, pathId }: { course: any; index: number; pathId: string }) {
  const removeMut = useRemoveCourseFromPath(pathId);
  const courseId = course.id || course.course_id;

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 group">
      <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
          {course.duration_minutes != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {course.duration_minutes >= 60 ? `${Math.round(course.duration_minutes / 60)}h` : `${course.duration_minutes}m`}
            </span>
          )}
          {course.difficulty && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${difficultyColor[course.difficulty?.toLowerCase()] || ""}`}>
              {course.difficulty}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => removeMut.mutate(courseId)}
        disabled={removeMut.isPending}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course Picker
// ---------------------------------------------------------------------------

function CoursePicker({
  pathId,
  existingCourseIds,
  onClose,
}: {
  pathId: string;
  existingCourseIds: string[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useCourses({ status: "published" });
  const addMut = useAddCourseToPath(pathId);

  const allCourses: any[] = data?.data ?? [];
  const available = allCourses.filter(
    (c) => !existingCourseIds.includes(c.id) && (!q || c.title?.toLowerCase().includes(q.toLowerCase())),
  );

  const handleAdd = async (courseId: string) => {
    try {
      await addMut.mutateAsync({ course_id: courseId });
      toast.success("Course added");
    } catch {
      toast.error("Failed to add course");
    }
  };

  return (
    <div className="mt-4 border border-blue-200 rounded-xl bg-blue-50/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Add Course</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search published courses..."
          autoFocus
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {available.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {q ? "No courses match" : "All published courses are already in this path"}
          </p>
        ) : (
          available.slice(0, 10).map((course) => (
            <button
              key={course.id}
              onClick={() => handleAdd(course.id)}
              disabled={addMut.isPending}
              className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-white transition"
            >
              <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                <p className="text-xs text-gray-500">
                  {course.duration_minutes != null && `${course.duration_minutes}m`}
                  {course.difficulty && ` · ${course.difficulty}`}
                </p>
              </div>
              <Plus className="h-4 w-4 text-blue-600 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
