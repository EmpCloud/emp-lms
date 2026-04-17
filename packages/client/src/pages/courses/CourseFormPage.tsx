import { useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { BookOpen, ArrowLeft, Save, Loader2, ShieldCheck } from "lucide-react";
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/courses")}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? "Edit Course" : "Create Course"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isEdit
              ? "Update the course details below."
              : "Fill in the details to create a new course."}
          </p>
        </div>
      </div>

      {/* Global error banner — surfaces react-hook-form validation errors
          that would otherwise silently block submission (fields above the
          fold, etc.) so the user can see what's wrong. */}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <strong>Please fix the following before saving:</strong>
          <ul className="mt-1 list-disc pl-5">
            {Object.entries(errors).map(([field, err]: [string, any]) => (
              <li key={field}>
                <span className="font-medium">{field}</span>: {err?.message || "invalid"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit, (invalid) => {
          console.warn("[CourseFormPage] validation blocked submit", invalid);
        })}
        className="space-y-6 rounded-2xl bg-white p-6 shadow-sm"
      >
        {/* Title */}
        <Field label="Title" error={errors.title?.message} required>
          <input {...register("title")} className={inputCls} placeholder="e.g. Introduction to React" />
        </Field>

        {/* Description */}
        <Field label="Description" error={errors.description?.message} required>
          <textarea
            {...register("description")}
            rows={4}
            className={cn(inputCls, "resize-y")}
            placeholder="Full course description..."
          />
        </Field>

        {/* Short description */}
        <Field label="Short Description" error={errors.short_description?.message}>
          <input
            {...register("short_description")}
            className={inputCls}
            placeholder="Brief summary (max 300 chars)"
          />
        </Field>

        {/* Category + Difficulty (2-col) */}
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

        {/* Duration + Passing Score (2-col) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Duration (minutes)" error={errors.duration?.message} required>
            <input
              type="number"
              {...register("duration")}
              className={inputCls}
              placeholder="e.g. 120"
              min={1}
            />
          </Field>

          <Field label="Passing Score (%)" error={errors.passing_score?.message}>
            <input
              type="number"
              {...register("passing_score")}
              className={inputCls}
              placeholder="e.g. 70"
              min={0}
              max={100}
            />
          </Field>
        </div>

        {/* Tags */}
        <Field label="Tags" error={errors.tags?.message}>
          <input
            {...register("tags")}
            className={inputCls}
            placeholder="Comma-separated, e.g. react, javascript, frontend"
          />
        </Field>

        {/* Thumbnail URL */}
        <Field label="Thumbnail URL" error={errors.thumbnail_url?.message}>
          <input
            {...register("thumbnail_url")}
            className={inputCls}
            placeholder="https://example.com/image.jpg"
          />
        </Field>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6">
          <Controller
            control={control}
            name="is_mandatory"
            render={({ field }) => (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-700">Mandatory course</span>
              </label>
            )}
          />
          <Controller
            control={control}
            name="is_featured"
            render={({ field }) => (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-700">Featured course</span>
              </label>
            )}
          />
        </div>

        {/* ── Compliance Section ──────────────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-800">Compliance Settings</span>
          </div>

          <Controller
            control={control}
            name="is_compliance"
            render={({ field }) => (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-700">This is a compliance course</span>
              </label>
            )}
          />

          {watch("is_compliance") && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          <button
            type="button"
            onClick={() => navigate("/courses")}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || createCourse.isPending || updateCourse.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting || createCourse.isPending || updateCourse.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Update Course" : "Create Course"}
          </button>
        </div>
      </form>
    </div>
  );
}
