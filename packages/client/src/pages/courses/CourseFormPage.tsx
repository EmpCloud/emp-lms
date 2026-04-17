import { useEffect } from "react";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import {
  BookOpen,
  ArrowLeft,
  Save,
  Loader2,
  ShieldCheck,
  FileText,
  Settings2,
  Image as ImageIcon,
  Tag as TagIcon,
  AlertCircle,
  Clock,
  Target,
  Layers,
  Star,
} from "lucide-react";
import { useCourse, useCreateCourse, useUpdateCourse, useCategories } from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

/* ── Schema ──────────────────────────────────────────────────────────────── */
const courseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  short_description: z.string().max(300).optional().or(z.literal("")),
  category_id: z.string().min(1, "Category is required"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"], {
    required_error: "Difficulty is required",
  }),
  duration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  is_mandatory: z.boolean().default(false),
  is_featured: z.boolean().default(false),
  is_compliance: z.boolean().default(false),
  compliance_type: z.enum(["policy", "training", "document_submission", "quiz"]).nullable().optional(),
  compliance_code: z.string().max(50).optional().or(z.literal("")),
  tags: z.string().optional().or(z.literal("")),
  passing_score: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal(0)),
  thumbnail_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type CourseFormData = z.infer<typeof courseSchema>;

/* ── Field Wrapper ───────────────────────────────────────────────────────── */
function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ── Input class ─────────────────────────────────────────────────────────── */
const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function CourseFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Gate the entire page to admin roles. Non-admins who land here via a
  // stray URL are redirected back to the catalog. The server-side middleware
  // also rejects the create/update POST, but this keeps the form from
  // flashing into view for employees at all.
  const currentUser = useAuthStore((s) => s.user);
  if (!isAdminRole(currentUser?.role)) {
    return <Navigate to="/courses" replace />;
  }

  const { data: courseRes, isLoading: courseLoading } = useCourse(id ?? "");
  const { data: categoriesRes } = useCategories();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse(id ?? "");

  const categories: any[] = categoriesRes?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      description: "",
      short_description: "",
      category_id: "",
      difficulty: undefined,
      duration: 0,
      is_mandatory: false,
      is_featured: false,
      is_compliance: false,
      compliance_type: null,
      compliance_code: "",
      tags: "",
      passing_score: 70,
      thumbnail_url: "",
    },
  });

  /* Populate form when editing */
  useEffect(() => {
    if (isEdit && courseRes?.data) {
      const c = courseRes.data;
      reset({
        title: c.title ?? "",
        description: c.description ?? "",
        short_description: c.shortDescription ?? c.short_description ?? "",
        category_id: c.categoryId ?? c.category_id ?? "",
        difficulty: c.difficulty ?? "beginner",
        duration: c.duration ?? 0,
        is_mandatory: Boolean(c.isMandatory ?? c.is_mandatory ?? false),
        is_featured: Boolean(c.isFeatured ?? c.is_featured ?? false),
        is_compliance: Boolean(c.isCompliance ?? c.is_compliance ?? false),
        compliance_type: c.complianceType ?? c.compliance_type ?? null,
        compliance_code: c.complianceCode ?? c.compliance_code ?? "",
        tags: Array.isArray(c.tags) ? c.tags.join(", ") : c.tags ?? "",
        passing_score: c.passingScore ?? c.passing_score ?? 70,
        thumbnail_url: c.thumbnailUrl ?? c.thumbnail_url ?? "",
      });
    }
  }, [isEdit, courseRes, reset]);

  async function onSubmit(data: CourseFormData) {
    const payload = {
      ...data,
      tags: data.tags
        ? data.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    try {
      if (isEdit) {
        await updateCourse.mutateAsync(payload);
        toast.success("Course updated successfully!");
      } else {
        await createCourse.mutateAsync(payload);
        toast.success("Course created successfully!");
      }
      navigate("/courses");
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  if (isEdit && courseLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const thumbnailUrl = watch("thumbnail_url");
  const saving = isSubmitting || createCourse.isPending || updateCourse.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-24">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 p-6 text-white shadow-sm">
        <div className="flex items-start gap-4">
          <Link
            to="/courses"
            className="rounded-lg bg-white/10 p-2 text-white/90 transition hover:bg-white/20"
            aria-label="Back to courses"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {isEdit ? "Edit Course" : "Create a New Course"}
              </h1>
              <p className="mt-0.5 text-sm text-indigo-100">
                {isEdit
                  ? "Update the course details below."
                  : "Fill in the details to launch a new learning experience."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Global error banner */}
      {Object.keys(errors).length > 0 && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <strong className="font-semibold">Please fix the following before saving:</strong>
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(errors).map(([field, err]: [string, any]) => (
                <li key={field}>
                  <span className="font-medium">{field}</span>: {err?.message || "invalid"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit(onSubmit, (invalid) => {
          console.warn("[CourseFormPage] validation blocked submit", invalid);
        })}
        className="space-y-6"
      >
        {/* ── Section: Basic Information ─────────────────────────────── */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <div className="rounded-lg bg-indigo-100 p-1.5">
              <FileText className="h-4 w-4 text-indigo-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Basic Information</h2>
          </div>
          <div className="space-y-5 p-6">
            <Field label="Title" error={errors.title?.message} required>
              <input {...register("title")} className={inputCls} placeholder="e.g. Introduction to React" />
            </Field>

            <Field label="Short Description" error={errors.short_description?.message}>
              <input
                {...register("short_description")}
                className={inputCls}
                placeholder="One-line summary shown on course cards (max 300 chars)"
                maxLength={300}
              />
            </Field>

            <Field label="Description" error={errors.description?.message} required>
              <textarea
                {...register("description")}
                rows={5}
                className={cn(inputCls, "resize-y")}
                placeholder="Full course description — what learners will get, who it's for, outcomes..."
              />
            </Field>
          </div>
        </section>

        {/* ── Section: Course Details ────────────────────────────────── */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <div className="rounded-lg bg-sky-100 p-1.5">
              <Layers className="h-4 w-4 text-sky-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Course Details</h2>
          </div>
          <div className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category" error={errors.category_id?.message} required>
                <select {...register("category_id")} className={inputCls}>
                  <option value="">Select category</option>
                  {categories
                    .filter((c: any) => c && typeof c === "object" && c.id)
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Difficulty" error={errors.difficulty?.message} required>
                <select {...register("difficulty")} className={inputCls}>
                  <option value="">Select difficulty</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Duration (minutes)" error={errors.duration?.message} required>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    {...register("duration")}
                    className={cn(inputCls, "pl-9")}
                    placeholder="e.g. 120"
                    min={1}
                  />
                </div>
              </Field>

              <Field label="Passing Score (%)" error={errors.passing_score?.message}>
                <div className="relative">
                  <Target className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    {...register("passing_score")}
                    className={cn(inputCls, "pl-9")}
                    placeholder="e.g. 70"
                    min={0}
                    max={100}
                  />
                </div>
              </Field>
            </div>
          </div>
        </section>

        {/* ── Section: Media & Tags ──────────────────────────────────── */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <div className="rounded-lg bg-amber-100 p-1.5">
              <ImageIcon className="h-4 w-4 text-amber-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Media &amp; Tags</h2>
          </div>
          <div className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Field label="Thumbnail URL" error={errors.thumbnail_url?.message}>
                  <input
                    {...register("thumbnail_url")}
                    className={inputCls}
                    placeholder="https://example.com/image.jpg"
                  />
                </Field>
                <p className="mt-1 text-xs text-gray-500">
                  Recommended: 16:9 aspect ratio, at least 1280×720px
                </p>
              </div>
              <div className="lg:col-span-1">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Preview</label>
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-200 bg-gray-50">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt="Thumbnail preview"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-xs">No image</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Field label="Tags" error={errors.tags?.message}>
              <div className="relative">
                <TagIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  {...register("tags")}
                  className={cn(inputCls, "pl-9")}
                  placeholder="Comma-separated, e.g. react, javascript, frontend"
                />
              </div>
            </Field>
          </div>
        </section>

        {/* ── Section: Options ───────────────────────────────────────── */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <div className="rounded-lg bg-emerald-100 p-1.5">
              <Settings2 className="h-4 w-4 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Options</h2>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2">
            <Controller
              control={control}
              name="is_mandatory"
              render={({ field }) => (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                    field.value
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Mandatory course</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Learners must complete this course
                    </p>
                  </div>
                </label>
              )}
            />
            <Controller
              control={control}
              name="is_featured"
              render={({ field }) => (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                    field.value
                      ? "border-amber-300 bg-amber-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <p className="flex items-center gap-1 text-sm font-medium text-gray-800">
                      Featured course <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Highlight on dashboard &amp; catalog
                    </p>
                  </div>
                </label>
              )}
            />
          </div>
        </section>

        {/* ── Section: Compliance ────────────────────────────────────── */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <div className="rounded-lg bg-purple-100 p-1.5">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Compliance Settings</h2>
          </div>
          <div className="space-y-5 p-6">
            <Controller
              control={control}
              name="is_compliance"
              render={({ field }) => (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                    field.value
                      ? "border-purple-300 bg-purple-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      This is a compliance course
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Track acceptance, document submission, or mandatory training with audit trail
                    </p>
                  </div>
                </label>
              )}
            />

            {watch("is_compliance") && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-purple-100 bg-purple-50/40 p-4 sm:grid-cols-2">
                <Field label="Compliance Type" error={errors.compliance_type?.message}>
                  <select {...register("compliance_type")} className={inputCls}>
                    <option value="">Select type</option>
                    <option value="policy">Policy (Accept terms)</option>
                    <option value="training">Training (Complete course)</option>
                    <option value="document_submission">Document Submission (Upload file)</option>
                    <option value="quiz">Quiz (Pass assessment)</option>
                  </select>
                </Field>

                <Field label="Compliance Code" error={errors.compliance_code?.message}>
                  <input
                    {...register("compliance_code")}
                    className={inputCls}
                    placeholder="e.g. GDPR-2024, SOC2-T1"
                    maxLength={50}
                  />
                </Field>
              </div>
            )}
          </div>
        </section>

        {/* ── Sticky Submit Bar ──────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-6 border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/courses")}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEdit ? "Update Course" : "Create Course"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
