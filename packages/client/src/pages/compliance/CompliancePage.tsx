import { useState } from "react";
import {
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  Play,
  RotateCcw,
  Users,
  CheckCircle,
  Clock,
  Target,
  Plus,
  X,
  ShieldCheck,
  FileText,
  BookOpen,
  HelpCircle,
  CalendarDays,
  Building2,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import {
  useMyCompliance,
  useComplianceDashboard,
  useComplianceRecords,
  useComplianceAssignments,
  useCreateComplianceAssignment,
  useUpdateComplianceAssignment,
  useDeactivateComplianceAssignment,
  useAcceptPolicy,
  usePolicyAcceptances,
  useCourses,
} from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

const COMPLIANCE_TYPE_MAP: Record<string, { icon: React.ComponentType<any>; label: string; color: string }> = {
  policy: { icon: ShieldCheck, label: "Policy", color: "bg-purple-100 text-purple-700" },
  training: { icon: BookOpen, label: "Training", color: "bg-blue-100 text-blue-700" },
  document_submission: { icon: FileText, label: "Document", color: "bg-amber-100 text-amber-700" },
  quiz: { icon: HelpCircle, label: "Quiz", color: "bg-teal-100 text-teal-700" },
};

function complianceTypeBadge(type: string | null | undefined) {
  if (!type) return null;
  const ct = COMPLIANCE_TYPE_MAP[type];
  if (!ct) return null;
  const Icon = ct.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ct.color}`}>
      <Icon className="h-3 w-3" />
      {ct.label}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    not_started: { bg: "bg-gray-100", text: "text-gray-700", label: "Not Started" },
    in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
    completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
    overdue: { bg: "bg-red-100", text: "text-red-700", label: "Overdue" },
  };
  const s = map[status] ?? map.not_started;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function deadlineIndicator(dueDate: string | undefined, status: string) {
  if (!dueDate || status === "completed") return null;
  const now = dayjs();
  const due = dayjs(dueDate);
  const daysLeft = due.diff(now, "day");

  if (daysLeft < 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" />
        {Math.abs(daysLeft)}d overdue
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-orange-600">
        <Clock className="h-3 w-3" />
        {daysLeft}d left
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
        <Clock className="h-3 w-3" />
        {daysLeft}d left
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-500">
      {daysLeft}d left
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

/* ── Assignment Modal (create or edit) ──────────────────────────────────── */
function AssignmentModal({
  onClose,
  assignment,
}: {
  onClose: () => void;
  assignment?: any;
}) {
  const isEdit = !!assignment;
  const { data: coursesRes } = useCourses({ limit: 100 });
  const createAssignment = useCreateComplianceAssignment();
  const updateAssignment = useUpdateComplianceAssignment();

  const complianceCourses = (coursesRes?.data ?? []).filter(
    (c: any) => c.isCompliance ?? c.is_compliance
  );

  const [form, setForm] = useState({
    name: assignment?.name ?? "",
    course_id: assignment?.courseId ?? assignment?.course_id ?? "",
    assigned_to_type: (assignment?.assignedToType ?? assignment?.assigned_to_type ?? "all") as string,
    due_date: assignment?.dueDate ?? assignment?.due_date
      ? dayjs(assignment.dueDate ?? assignment.due_date).format("YYYY-MM-DD")
      : "",
    description: assignment?.description ?? "",
  });

  const pending = createAssignment.isPending || updateAssignment.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.course_id || !form.due_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      if (isEdit) {
        await updateAssignment.mutateAsync({
          id: assignment.id,
          name: form.name,
          due_date: form.due_date,
          description: form.description || undefined,
        });
        toast.success("Compliance assignment updated!");
      } else {
        await createAssignment.mutateAsync({
          name: form.name,
          course_id: form.course_id,
          assigned_to_type: form.assigned_to_type,
          due_date: form.due_date,
          description: form.description || undefined,
        });
        toast.success("Compliance assignment created!");
      }
      onClose();
    } catch {
      toast.error(isEdit ? "Failed to update assignment" : "Failed to create assignment");
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        style={{ maxWidth: "560px" }}
        className="w-full rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-100 p-1.5">
              <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit Compliance Assignment" : "Create Compliance Assignment"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Assignment Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Q2 2026 GDPR Refresher"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Compliance Course <span className="text-red-500">*</span>
            </label>
            <select
              value={form.course_id}
              onChange={(e) => setForm((p) => ({ ...p, course_id: e.target.value }))}
              className={`${inputCls} ${isEdit ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""}`}
              disabled={isEdit}
            >
              <option value="">Select a compliance course</option>
              {complianceCourses.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title} {complianceTypeBadge(c.complianceType ?? c.compliance_type) ? `(${(c.complianceType ?? c.compliance_type)})` : ""}
                </option>
              ))}
            </select>
            {isEdit ? (
              <p className="mt-1 text-xs text-gray-500">
                Course cannot be changed once the assignment exists.
              </p>
            ) : complianceCourses.length === 0 ? (
              <p className="mt-1 text-xs text-amber-600">
                No compliance courses found. Mark a course as compliance in the course editor first.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assign To <span className="text-red-500">*</span>
              </label>
              <select
                value={form.assigned_to_type}
                onChange={(e) => setForm((p) => ({ ...p, assigned_to_type: e.target.value }))}
                className={`${inputCls} ${isEdit ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""}`}
                disabled={isEdit}
              >
                <option value="all">All Employees</option>
                <option value="department">By Department</option>
                <option value="role">By Role</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                className={inputCls}
                min={dayjs().format("YYYY-MM-DD")}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className={`${inputCls} resize-y`}
              rows={2}
              placeholder="Optional notes about this assignment..."
            />
          </div>

          <div className="-mx-6 -mb-5 mt-5 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEdit ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEdit ? "Save Changes" : "Create Assignment"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

/* ── Delete Assignment Confirm Dialog ───────────────────────────────────── */
function DeleteAssignmentDialog({
  assignment,
  isPending,
  onCancel,
  onConfirm,
}: {
  assignment: any;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        style={{ maxWidth: "440px" }}
        className="w-full rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Deactivate Assignment?</h3>
          <p className="mt-2 text-sm text-gray-600">
            Are you sure you want to deactivate <span className="font-medium text-gray-900">&quot;{assignment.name}&quot;</span>?
            This will stop new records from being created for this assignment. Existing compliance
            records will remain but the assignment will no longer be visible in the active list.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Compliance Dashboard
// ---------------------------------------------------------------------------
function AdminComplianceDashboard() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editAssignment, setEditAssignment] = useState<any | null>(null);
  const [deleteAssignment, setDeleteAssignment] = useState<any | null>(null);
  const { data: dashboardData, isLoading: dashLoading } = useComplianceDashboard();
  const recordParams = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data: recordsData, isLoading: recordsLoading } = useComplianceRecords(recordParams);
  const { data: assignmentsData } = useComplianceAssignments();
  const deactivateAssignment = useDeactivateComplianceAssignment();

  const dashboard = dashboardData?.data as any;
  const records: any[] = recordsData?.data ?? [];
  const assignments: any[] = assignmentsData?.data ?? [];
  const isLoading = dashLoading || recordsLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const safePct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 100) : 0;

  const stats = [
    {
      icon: ClipboardCheck,
      label: "Total Assignments",
      value: dashboard?.total_assignments ?? 0,
      color: "bg-indigo-500",
    },
    {
      icon: Target,
      label: "Completion Rate",
      value: `${dashboard?.completion_rate ?? 0}%`,
      color: "bg-green-500",
    },
    {
      icon: AlertTriangle,
      label: "Overdue",
      value: dashboard?.overdue ?? 0,
      color: "bg-red-500",
    },
    {
      icon: Users,
      label: "Total Records",
      value: dashboard?.total_records ?? 0,
      color: "bg-cyan-500",
    },
  ];

  const deptBreakdown: any[] = dashboard?.by_department ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          New Assignment
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Status breakdown */}
      {dashboard && (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-green-600">{dashboard.completed ?? 0}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-blue-600">{dashboard.in_progress ?? 0}</p>
            <p className="text-xs text-gray-500">In Progress</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-600">{dashboard.not_started ?? 0}</p>
            <p className="text-xs text-gray-500">Not Started</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-600">{dashboard.overdue ?? 0}</p>
            <p className="text-xs text-gray-500">Overdue</p>
          </div>
        </div>
      )}

      {/* Department Breakdown */}
      {deptBreakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Building2 className="h-5 w-5 text-gray-400" />
            Department Breakdown
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deptBreakdown.map((dept: any, i: number) => {
              const total = Number(dept.total) || 0;
              const completed = Number(dept.completed) || 0;
              const overdue = Number(dept.overdue) || 0;
              const pct = safePct(completed, total);
              return (
                <div key={dept.department_id ?? i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-800">
                    Dept #{dept.department_id ?? "Unknown"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600">{pct}%</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    <span>{completed}/{total} done</span>
                    {overdue > 0 && <span className="text-red-500">{overdue} overdue</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Assignments List */}
      {assignments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <CalendarDays className="h-5 w-5 text-gray-400" />
            Active Assignments
          </h2>
          <div className="space-y-2">
            {assignments.slice(0, 10).map((a: any) => {
              const assignType = a.assignedToType ?? a.assigned_to_type;
              return (
                <div key={a.id} className="group flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{a.name}</p>
                    <p className="text-xs text-gray-500">
                      Due {dayjs(a.dueDate ?? a.due_date).format("MMM D, YYYY")}
                      {" \u00b7 "}
                      {assignType === "all" ? "All employees" : assignType}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {deadlineIndicator(a.dueDate ?? a.due_date, "")}
                    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setEditAssignment(a)}
                        className="rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteAssignment(a)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Compliance Records</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ClipboardCheck className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No compliance records</h3>
          <p className="mt-1 text-sm text-gray-500">No compliance records found for the selected filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Employee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Course
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record: any) => {
                const isOverdue = record.status === "overdue";
                return (
                  <tr key={record.id} className={isOverdue ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {record.user_name ?? record.userName ?? `User #${record.user_id}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {record.course_title ?? record.courseName ?? "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {complianceTypeBadge(record.compliance_type ?? record.complianceType)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {statusBadge(record.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <div className="flex flex-col">
                        <span>
                          {record.due_date || record.dueDate
                            ? dayjs(record.due_date ?? record.dueDate).format("MMM D, YYYY")
                            : "\u2014"}
                        </span>
                        {deadlineIndicator(record.due_date ?? record.dueDate, record.status)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${
                              record.progress === 100
                                ? "bg-green-500"
                                : isOverdue
                                  ? "bg-red-500"
                                  : "bg-brand-500"
                            }`}
                            style={{ width: `${record.progress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs">{record.progress ?? 0}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && <AssignmentModal onClose={() => setShowCreateModal(false)} />}
      {editAssignment && (
        <AssignmentModal
          assignment={editAssignment}
          onClose={() => setEditAssignment(null)}
        />
      )}
      {deleteAssignment && (
        <DeleteAssignmentDialog
          assignment={deleteAssignment}
          isPending={deactivateAssignment.isPending}
          onCancel={() => setDeleteAssignment(null)}
          onConfirm={async () => {
            try {
              await deactivateAssignment.mutateAsync(deleteAssignment.id);
              toast.success("Assignment deactivated");
              setDeleteAssignment(null);
            } catch {
              toast.error("Failed to deactivate assignment");
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy Acceptance Card — shown for policy-type compliance items
// ---------------------------------------------------------------------------
function PolicyAcceptanceCard({
  item,
  onAccepted,
}: {
  item: any;
  onAccepted: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const acceptPolicy = useAcceptPolicy();

  const handleAccept = async () => {
    if (!agreed) {
      toast.error("Please check the agreement checkbox first");
      return;
    }
    try {
      await acceptPolicy.mutateAsync({
        course_id: item.courseId ?? item.course_id,
        enrollment_id: item.enrollmentId ?? item.enrollment_id,
      });
      toast.success("Policy accepted successfully!");
      onAccepted();
    } catch {
      toast.error("Failed to accept policy");
    }
  };

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-purple-100 p-2">
          <ShieldCheck className="h-5 w-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {item.courseName ?? item.course_title ?? "Policy Agreement"}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Please review and accept this policy to complete this compliance requirement.
          </p>
          {(item.dueDate ?? item.due_date) && (
            <p className="mt-1 text-xs text-gray-500">
              Due by {dayjs(item.dueDate ?? item.due_date).format("MMM D, YYYY")}
              {" \u00b7 "}
              {deadlineIndicator(item.dueDate ?? item.due_date, item.status)}
            </p>
          )}

          <div className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              id={`agree-${item.id}`}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor={`agree-${item.id}`} className="text-sm text-gray-700">
              I have read and agree to the terms of this policy. I understand that my acceptance
              is being recorded with a timestamp for compliance purposes.
            </label>
          </div>

          <button
            onClick={handleAccept}
            disabled={!agreed || acceptPolicy.isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {acceptPolicy.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            I Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee Compliance View
// ---------------------------------------------------------------------------
function EmployeeComplianceView() {
  const [statusFilter, setStatusFilter] = useState("all");
  const params = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data, isLoading, refetch } = useMyCompliance(params);
  const { data: acceptancesData } = usePolicyAcceptances();
  const items: any[] = data?.data ?? [];
  const acceptances: any[] = acceptancesData?.data ?? [];
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // Separate policy items that need acceptance
  const acceptedCourseIds = new Set(
    acceptances.map((a: any) => a.courseId ?? a.course_id)
  );

  // Quick stats for the employee
  const totalItems = items.length;
  const completedItems = items.filter((i: any) => i.status === "completed").length;
  const overdueItems = items.filter((i: any) => i.status === "overdue").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Training</h1>
            <p className="text-sm text-gray-500">
              {completedItems}/{totalItems} completed
              {overdueItems > 0 && (
                <span className="ml-2 text-red-500 font-medium">{overdueItems} overdue</span>
              )}
            </p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Policy acceptance cards — shown prominently at the top */}
      {items
        .filter((item: any) => {
          const ct = item.complianceType ?? item.compliance_type;
          const cid = item.courseId ?? item.course_id;
          return ct === "policy" && item.status !== "completed" && !acceptedCourseIds.has(cid);
        })
        .map((item: any) => (
          <PolicyAcceptanceCard key={item.id} item={item} onAccepted={() => refetch()} />
        ))}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ClipboardCheck className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No compliance assignments</h3>
          <p className="mt-1 text-sm text-gray-500">You have no compliance training assigned.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Course
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Progress
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item: any) => {
                const isOverdue = item.status === "overdue";
                const ct = item.complianceType ?? item.compliance_type;
                const cid = item.courseId ?? item.course_id;
                const isPolicyPending = ct === "policy" && item.status !== "completed" && !acceptedCourseIds.has(cid);
                return (
                  <tr
                    key={item.id}
                    className={isOverdue ? "bg-red-50" : "hover:bg-gray-50"}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {item.courseName ?? item.course_title ?? "Course"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {complianceTypeBadge(ct)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {statusBadge(item.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <div className="flex flex-col">
                        <span>{dayjs(item.dueDate ?? item.due_date).format("MMM D, YYYY")}</span>
                        {deadlineIndicator(item.dueDate ?? item.due_date, item.status)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${
                              item.progress === 100
                                ? "bg-green-500"
                                : isOverdue
                                  ? "bg-red-500"
                                  : "bg-brand-500"
                            }`}
                            style={{ width: `${item.progress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs">{item.progress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      {item.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" /> Done
                        </span>
                      ) : isPolicyPending ? (
                        <span className="text-xs text-purple-600 font-medium">See above</span>
                      ) : (
                        <button
                          onClick={() => navigate(`/courses/${cid}`)}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition"
                        >
                          {item.status === "not_started" ? (
                            <>
                              <Play className="h-3.5 w-3.5" /> Start
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" /> Continue
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export — shows admin dashboard or employee view based on role
// ---------------------------------------------------------------------------
export default function CompliancePage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);
  const [searchParams] = useSearchParams();
  // ?view=my forces the personal view even for admins — used by the
  // "My Compliance" menu item in the sidebar.
  const viewMode = searchParams.get("view");

  if (isAdmin && viewMode !== "my") {
    return <AdminComplianceDashboard />;
  }

  return <EmployeeComplianceView />;
}
