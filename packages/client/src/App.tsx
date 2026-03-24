import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore, extractSSOToken } from "@/lib/auth-store";
import { apiPost } from "@/api/client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ---------- Lazy-loaded pages ----------
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const CourseCatalogPage = lazy(() => import("@/pages/courses/CourseCatalogPage"));
const CourseCreatePage = lazy(() => import("@/pages/courses/CourseCreatePage"));
const CourseDetailPage = lazy(() => import("@/pages/courses/CourseDetailPage"));
const CourseEditPage = lazy(() => import("@/pages/courses/CourseEditPage"));
const CourseBuilderPage = lazy(() => import("@/pages/courses/CourseBuilderPage"));
const MyLearningPage = lazy(() => import("@/pages/courses/MyLearningPage"));
const LearningPathsPage = lazy(() => import("@/pages/learning-paths/LearningPathsPage"));
const LearningPathDetailPage = lazy(() => import("@/pages/learning-paths/LearningPathDetailPage"));
const QuizPage = lazy(() => import("@/pages/quizzes/QuizPage"));
const CertificationsPage = lazy(() => import("@/pages/certifications/CertificationsPage"));
const CompliancePage = lazy(() => import("@/pages/compliance/CompliancePage"));
const ILTPage = lazy(() => import("@/pages/ilt/ILTPage"));
const AnalyticsPage = lazy(() => import("@/pages/analytics/AnalyticsPage"));
const MarketplacePage = lazy(() => import("@/pages/marketplace/MarketplacePage"));
const DiscussionsPage = lazy(() => import("@/pages/courses/DiscussionsPage"));
const BulkEnrollPage = lazy(() => import("@/pages/courses/BulkEnrollPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const LeaderboardPage = lazy(() => import("@/pages/dashboard/LeaderboardPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

// ---------- Spinner fallback ----------
function LoadingSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

// ---------- SSO Gate ----------
function SSOGate({ children }: { children: React.ReactNode }) {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const ssoToken = extractSSOToken();
    if (!ssoToken) {
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const res = await apiPost<{
          user: Parameters<typeof login>[0];
          tokens: { accessToken: string; refreshToken: string };
          accessToken?: string;
          refreshToken?: string;
        }>("/auth/sso", { token: ssoToken });

        if (res.success && res.data) {
          const accessToken = res.data.tokens?.accessToken || res.data.accessToken!;
          const refreshToken = res.data.tokens?.refreshToken || res.data.refreshToken!;
          login(res.data.user, { accessToken, refreshToken });
          toast.success("Signed in via SSO");
          navigate("/dashboard", { replace: true });
        }
      } catch {
        toast.error("SSO authentication failed");
      } finally {
        setChecking(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return <LoadingSpinner />;
  return <>{children}</>;
}

// ---------- Protected Route ----------
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ---------- Root redirect ----------
function RootRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

// ---------- App ----------
export default function App() {
  return (
    <SSOGate>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Protected routes inside DashboardLayout */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/courses" element={<CourseCatalogPage />} />
            <Route path="/courses/new" element={<CourseCreatePage />} />
            <Route path="/courses/:id" element={<CourseDetailPage />} />
            <Route path="/courses/:id/edit" element={<CourseEditPage />} />
            <Route path="/courses/:id/builder" element={<CourseBuilderPage />} />
            <Route path="/my-learning" element={<MyLearningPage />} />
            <Route path="/learning-paths" element={<LearningPathsPage />} />
            <Route path="/learning-paths/:id" element={<LearningPathDetailPage />} />
            <Route path="/quizzes/:id" element={<QuizPage />} />
            <Route path="/certifications" element={<CertificationsPage />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/ilt" element={<ILTPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/discussions" element={<DiscussionsPage />} />
            <Route path="/bulk-enroll" element={<BulkEnrollPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </SSOGate>
  );
}
