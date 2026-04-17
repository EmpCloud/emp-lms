import { Link } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Users,
  Award,
  Play,
  Flame,
  ArrowRight,
  CalendarDays,
  LayoutGrid,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useOverviewAnalytics, useMyEnrollments, useMyCertificates } from "@/api/hooks";
import { formatDate } from "@/lib/utils";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

/* ── Skeleton ────────────────────────────────────────────────────────────── */
function StatSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-3 h-10 w-10 rounded-lg bg-gray-200" />
      <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
      <div className="h-7 w-14 rounded bg-gray-200" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
      <div className="h-64 w-full rounded bg-gray-100" />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-36 rounded bg-gray-200" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className={`mb-3 inline-flex rounded-lg p-2.5 ${color}`}>{icon}</div>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

/* ── Quick Link ──────────────────────────────────────────────────────────── */
function QuickLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </Link>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  // Admin gets the full analytics endpoint; employees compute from their
  // own enrollments (the analytics route is admin-only and 403s otherwise).
  const { data: analytics, isLoading: analyticsLoading } =
    useOverviewAnalytics();
  const { data: allEnrollments, isLoading: enrollmentsLoading } =
    useMyEnrollments({ limit: 100 });
  const { data: certs } = useMyCertificates();

  const isLoading = (isAdmin ? analyticsLoading : false) || enrollmentsLoading;

  const myEnrollmentList: any[] = allEnrollments?.data ?? [];
  const myCertsList: any[] = certs?.data ?? [];

  // Recent enrollments — sorted by most recent activity
  const recentEnrollments: any[] = [...myEnrollmentList]
    .sort((a: any, b: any) => {
      const da = a.updatedAt || a.updated_at || a.enrolledAt || a.enrolled_at || "";
      const db2 = b.updatedAt || b.updated_at || b.enrolledAt || b.enrolled_at || "";
      return db2 > da ? 1 : -1;
    })
    .slice(0, 5);

  // For employees: derive stats from their own enrollments + certs.
  const raw = analytics?.data ?? {};
  const completedEnrollments = myEnrollmentList.filter(
    (e: any) => e.status === "completed",
  );
  const stats = isAdmin
    ? {
        totalCourses: raw.total_courses ?? raw.totalCourses ?? 0,
        myEnrollments: raw.total_enrollments ?? raw.myEnrollments ?? 0,
        completed: raw.completed_enrollments ?? raw.completed ?? 0,
        certificatesEarned:
          raw.total_certificates_issued ?? raw.certificatesEarned ?? 0,
        currentStreak: raw.current_streak ?? raw.currentStreak ?? 0,
        completionByMonth: raw.completion_by_month ?? raw.completionByMonth ?? [],
      }
    : {
        totalCourses: myEnrollmentList.length,
        myEnrollments: myEnrollmentList.length,
        completed: completedEnrollments.length,
        certificatesEarned: myCertsList.length,
        currentStreak: 0,
        completionByMonth: [] as any[],
      };

  // Build chart data — for employees, show per-course progress as a bar chart
  // since we don't have monthly aggregation without the analytics endpoint.
  const chartData: { name: string; completion: number }[] =
    stats.completionByMonth.length > 0
      ? stats.completionByMonth
      : myEnrollmentList.slice(0, 8).map((e: any) => ({
          name:
            (e.course_title ?? e.courseTitle ?? e.course?.title ?? "Course")
              .split(" ")
              .slice(0, 3)
              .join(" "),
          completion: Number(e.progress_percentage ?? e.progressPercentage ?? e.progress ?? 0),
        }));

  /* ── Loading state ─────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
          <ActivitySkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back! Here&apos;s your learning overview.
        </p>
      </div>

      {/* ── Stats Grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Total Courses"
          value={stats?.totalCourses ?? 0}
          icon={<BookOpen className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-50"
        />
        <StatCard
          label="My Enrollments"
          value={stats?.myEnrollments ?? 0}
          icon={<Users className="h-5 w-5 text-sky-600" />}
          color="bg-sky-50"
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          icon={<Award className="h-5 w-5 text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard
          label="Certificates Earned"
          value={stats?.certificatesEarned ?? 0}
          icon={<Award className="h-5 w-5 text-amber-600" />}
          color="bg-amber-50"
        />
        <StatCard
          label="Current Streak"
          value={`${stats?.currentStreak ?? 0} days`}
          icon={<Flame className="h-5 w-5 text-rose-600" />}
          color="bg-rose-50"
        />
      </div>

      {/* ── Chart + Activity ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Completion chart */}
        <div className="rounded-2xl bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Completion Rates
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Completion"]}
                  contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
                />
                <Bar
                  dataKey="completion"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">
              No completion data available yet.
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recent Activity
          </h2>
          {Array.isArray(recentEnrollments) && recentEnrollments.length > 0 ? (
            <ul className="space-y-4">
              {recentEnrollments
                .filter((e: any) => e && typeof e === "object" && e.id)
                .map((enrollment: any) => (
                <li key={enrollment.id} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-indigo-100 p-2">
                    <Play className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {enrollment.courseTitle ?? enrollment.course?.title ?? enrollment.courseName ?? enrollment.course_title ?? "Course"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {Number(enrollment.progressPercentage ?? enrollment.progress_percentage ?? enrollment.progress ?? 0)}% complete
                      {(enrollment.updatedAt || enrollment.updated_at) &&
                        ` \u00b7 ${formatDate(enrollment.updatedAt || enrollment.updated_at)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No recent activity.</p>
          )}
        </div>
      </div>

      {/* ── Quick Links ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Quick Links
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            to="/courses"
            icon={<Play className="h-5 w-5 text-indigo-500" />}
            label="Continue Learning"
          />
          <QuickLink
            to="/courses?tab=all"
            icon={<LayoutGrid className="h-5 w-5 text-sky-500" />}
            label="Browse Catalog"
          />
          <QuickLink
            to="/ilt"
            icon={<CalendarDays className="h-5 w-5 text-amber-500" />}
            label="Upcoming ILT Sessions"
          />
        </div>
      </div>
    </div>
  );
}
