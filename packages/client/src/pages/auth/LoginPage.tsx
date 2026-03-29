import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { GraduationCap, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/auth-store";
import { apiPost } from "@/api/client";

interface LoginResponse {
  user: {
    empcloudUserId: number;
    empcloudOrgId: number;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
  };
  tokens?: { accessToken: string; refreshToken: string };
  accessToken?: string;
  refreshToken?: string;
}

const FEATURES = [
  "Course catalog",
  "SCORM support",
  "Quizzes",
  "Certifications",
  "Learning paths",
  "Compliance training",
  "Progress tracking",
  "Analytics",
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate("/dashboard", { replace: true });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost<LoginResponse>("/auth/login", { email, password });
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || "Login failed");
      }
      return res.data;
    },
    onSuccess: (data) => {
      const accessToken = data.tokens?.accessToken || data.accessToken!;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken!;
      login(data.user, { accessToken, refreshToken });
      toast.success("Welcome back!");
      navigate("/dashboard", { replace: true });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Invalid credentials");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please enter email and password");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-12">
        <div className="max-w-md text-white">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <GraduationCap className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold">EMP LMS</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight">
            Empower learning and development
          </h1>

          <p className="mt-4 text-lg text-brand-100">
            Create courses, run quizzes, track certifications, manage compliance
            training, and build learning paths &mdash; all in one place.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-brand-100">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          {/* Mobile-only branding */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <GraduationCap className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">EMP LMS</h1>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to your learning platform
            </p>
          </div>

          {/* Desktop heading */}
          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to your learning platform
            </p>
          </div>

          {/* Login card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mutation.isPending ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          {/* Demo hint */}
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-center text-xs text-blue-700">
            <p className="font-medium">Demo credentials</p>
            <p className="mt-0.5">
              admin@demo.com / demo1234 &mdash; learner@demo.com / demo1234
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
