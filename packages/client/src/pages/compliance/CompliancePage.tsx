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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useMyCompliance, useComplianceDashboard, useComplianceRecords } from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

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
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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

// ---------------------------------------------------------------------------
// Admin Compliance Dashboard
// ---------------------------------------------------------------------------
function AdminComplianceDashboard() {
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: dashboardData, isLoading: dashLoading } = useComplianceDashboard();
  const recordParams = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data: recordsData, isLoading: recordsLoading } = useComplianceRecords(recordParams);

  const dashboard = dashboardData?.data as any;
  const records: any[] = recordsData?.data ?? [];
  const isLoading = dashLoading || recordsLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
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
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-green-600">{dashboard.completed ?? 0}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-blue-600">{dashboard.in_progress ?? 0}</p>
            <p className="text-xs text-gray-500">In Progress</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-600">{dashboard.not_started ?? 0}</p>
            <p className="text-xs text-gray-500">Not Started</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-600">{dashboard.overdue ?? 0}</p>
            <p className="text-xs text-gray-500">Overdue</p>
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
                      {record.course_name ?? record.courseName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {statusBadge(record.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <span className={isOverdue ? "flex items-center gap-1 font-medium text-red-600" : ""}>
                        {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                        {record.due_date || record.dueDate
                          ? dayjs(record.due_date ?? record.dueDate).format("MMM D, YYYY")
                          : "—"}
                      </span>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee Compliance View
// ---------------------------------------------------------------------------
function EmployeeComplianceView() {
  const [statusFilter, setStatusFilter] = useState("all");
  const params = statusFilter !== "all" ? { status: statusFilter } : undefined;
  const { data, isLoading } = useMyCompliance(params);
  const items: any[] = data?.data ?? [];
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Compliance Training</h1>
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
                return (
                  <tr
                    key={item.id}
                    className={isOverdue ? "bg-red-50" : "hover:bg-gray-50"}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {item.courseName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {statusBadge(item.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <span className={isOverdue ? "flex items-center gap-1 font-medium text-red-600" : ""}>
                        {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                        {dayjs(item.dueDate).format("MMM D, YYYY")}
                      </span>
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
                      {item.status !== "completed" ? (
                        <button
                          onClick={() => navigate(`/courses/${item.courseId}`)}
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
                      ) : (
                        <span className="text-xs font-medium text-green-600">Done</span>
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

  if (isAdmin) {
    return <AdminComplianceDashboard />;
  }

  return <EmployeeComplianceView />;
}
