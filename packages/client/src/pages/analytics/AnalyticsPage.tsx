import { BarChart3, Loader2, Users, GraduationCap, TrendingUp, Target } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useOverviewAnalytics } from "@/api/hooks";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

const PIE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

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

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useOverviewAnalytics();
  const analytics = data?.data as any;

  if (!isAdminRole(user?.role)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <BarChart3 className="h-12 w-12 text-gray-400" />
        <h2 className="mt-4 text-lg font-medium text-gray-900">Access Restricted</h2>
        <p className="mt-1 text-sm text-gray-500">Analytics are available to administrators only.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const stats = [
    {
      icon: GraduationCap,
      label: "Total Enrollments",
      value: analytics?.totalEnrollments?.toLocaleString() ?? 0,
      color: "bg-indigo-500",
    },
    {
      icon: Target,
      label: "Completion Rate",
      value: `${analytics?.completionRate ?? 0}%`,
      color: "bg-green-500",
    },
    {
      icon: TrendingUp,
      label: "Average Score",
      value: `${analytics?.avgScore ?? 0}%`,
      color: "bg-amber-500",
    },
    {
      icon: Users,
      label: "Active Learners",
      value: analytics?.activeLearners?.toLocaleString() ?? 0,
      color: "bg-cyan-500",
    },
  ];

  const completionTrend: any[] = analytics?.completionTrend ?? [];
  const topCourses: any[] = analytics?.topCourses ?? [];
  const departmentData: any[] = analytics?.enrollmentByDepartment ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Completion Trend */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Completion Trend</h2>
          <div className="h-72">
            {completionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={completionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                  <Line
                    type="monotone"
                    dataKey="completions"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#6366f1" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No completion data in the last 6 months.
              </div>
            )}
          </div>
        </div>

        {/* Top Courses */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Top Courses</h2>
          <div className="h-72">
            {topCourses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCourses} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                    interval={0}
                  />
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                  <Bar dataKey="enrollments" fill="#6366f1" radius={[0, 4, 4, 0]} name="Enrollments" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No course enrollments yet.
              </div>
            )}
          </div>
        </div>

        {/* Enrollment by Department */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Enrollment by Department</h2>
          <div className="h-72">
            {departmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentData}
                    dataKey="count"
                    nameKey="department"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ department, percent }: any) =>
                      `${department} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {departmentData.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No department data available. Enrollments may not be linked to departments.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
