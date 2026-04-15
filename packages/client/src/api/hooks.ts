import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";

// ── Auth ──────────────────────────────────────────────────────────────────
export function useLogin() {
  return useMutation({ mutationFn: (d: { email: string; password: string }) => apiPost<any>("/auth/login", d) });
}
export function useSSOLogin() {
  return useMutation({ mutationFn: (token: string) => apiPost<any>("/auth/sso", { token }) });
}

// ── Courses ───────────────────────────────────────────────────────────────
export function useCourses(params?: Record<string, any>) {
  return useQuery({ queryKey: ["courses", params], queryFn: () => apiGet<any>("/courses", params) });
}
export function useCourse(id: string) {
  return useQuery({ queryKey: ["courses", id], queryFn: () => apiGet<any>(`/courses/${id}`), enabled: !!id });
}
export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => apiPost<any>("/courses", d), onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }) });
}
export function useUpdateCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => apiPut<any>(`/courses/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }) });
}
export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete<any>(`/courses/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }) });
}

// ── Enrollments ───────────────────────────────────────────────────────────
export function useMyEnrollments(params?: Record<string, any>) {
  return useQuery({ queryKey: ["enrollments", "my", params], queryFn: () => apiGet<any>("/enrollments/my", params) });
}
export function useEnrollment(id: string) {
  return useQuery({ queryKey: ["enrollments", id], queryFn: () => apiGet<any>(`/enrollments/${id}`), enabled: !!id });
}
export function useEnroll() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => apiPost<any>("/enrollments", d), onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }) });
}
export function useMarkLessonComplete(enrollmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { lessonId: string; time_spent?: number }) =>
      apiPost<any>(`/enrollments/${enrollmentId}/lessons/${args.lessonId}/complete`, {
        time_spent: args.time_spent ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["enrollments", enrollmentId] });
      qc.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

// ── Quizzes ───────────────────────────────────────────────────────────────
export function useAllQuizzes(params?: Record<string, any>) {
  return useQuery({ queryKey: ["quizzes", "all", params], queryFn: () => apiGet<any>("/quizzes", params) });
}
export function useQuizzes(courseId: string) {
  return useQuery({ queryKey: ["quizzes", courseId], queryFn: () => apiGet<any>("/quizzes", { course_id: courseId }), enabled: !!courseId });
}
export function useQuiz(id: string) {
  return useQuery({ queryKey: ["quizzes", "detail", id], queryFn: () => apiGet<any>(`/quizzes/${id}`), enabled: !!id });
}
export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => apiPost<any>("/quizzes/attempt", d), onSuccess: () => qc.invalidateQueries({ queryKey: ["quizzes"] }) });
}

// ── Learning Paths ────────────────────────────────────────────────────────
export function useLearningPaths(params?: Record<string, any>) {
  return useQuery({ queryKey: ["learning-paths", params], queryFn: () => apiGet<any>("/learning-paths", params) });
}
export function useLearningPath(id: string) {
  return useQuery({ queryKey: ["learning-paths", id], queryFn: () => apiGet<any>(`/learning-paths/${id}`), enabled: !!id });
}

// ── Certifications ────────────────────────────────────────────────────────
export function useMyCertificates(params?: Record<string, any>) {
  return useQuery({ queryKey: ["certificates", "my", params], queryFn: () => apiGet<any>("/certificates/my", params) });
}

// ── Compliance ────────────────────────────────────────────────────────────
export function useMyCompliance(params?: Record<string, any>) {
  return useQuery({ queryKey: ["compliance", "my", params], queryFn: () => apiGet<any>("/compliance/my", params) });
}
export function useComplianceDashboard() {
  return useQuery({ queryKey: ["compliance", "dashboard"], queryFn: () => apiGet<any>("/compliance/dashboard") });
}
export function useComplianceRecords(params?: Record<string, any>) {
  return useQuery({ queryKey: ["compliance", "records", params], queryFn: () => apiGet<any>("/compliance/records", params) });
}

// ── ILT Sessions ──────────────────────────────────────────────────────────
export function useILTSessions(params?: Record<string, any>) {
  return useQuery({ queryKey: ["ilt", params], queryFn: () => apiGet<any>("/ilt", params) });
}

// ── Analytics ─────────────────────────────────────────────────────────────
export function useOverviewAnalytics() {
  return useQuery({ queryKey: ["analytics", "overview"], queryFn: () => apiGet<any>("/analytics/overview") });
}
export function useCourseAnalytics(courseId: string) {
  return useQuery({ queryKey: ["analytics", "course", courseId], queryFn: () => apiGet<any>(`/analytics/courses/${courseId}`), enabled: !!courseId });
}

// ── Notifications ─────────────────────────────────────────────────────────
export function useNotifications(params?: Record<string, any>) {
  return useQuery({ queryKey: ["notifications", params], queryFn: () => apiGet<any>("/notifications", params) });
}
export function useUnreadCount() {
  return useQuery({ queryKey: ["notifications", "unread"], queryFn: () => apiGet<any>("/notifications/unread-count") });
}
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiPatch<any>(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
}

// ── Discussions ───────────────────────────────────────────────────────────
export function useDiscussions(courseId: string) {
  return useQuery({ queryKey: ["discussions", courseId], queryFn: () => apiGet<any>("/discussions", { course_id: courseId }), enabled: !!courseId });
}

// ── Ratings ───────────────────────────────────────────────────────────────
export function useRatings(courseId: string) {
  return useQuery({ queryKey: ["ratings", courseId], queryFn: () => apiGet<any>("/ratings", { course_id: courseId }), enabled: !!courseId });
}
export function useSubmitRating() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: any) => apiPost<any>("/ratings", d), onSuccess: () => qc.invalidateQueries({ queryKey: ["ratings"] }) });
}

// ── Gamification ──────────────────────────────────────────────────────────
export function useLeaderboard() {
  return useQuery({ queryKey: ["gamification", "leaderboard"], queryFn: () => apiGet<any>("/gamification/leaderboard") });
}
export function useMyPoints() {
  return useQuery({ queryKey: ["gamification", "points"], queryFn: () => apiGet<any>("/gamification/my/points") });
}
export function useMyStreak() {
  return useQuery({ queryKey: ["gamification", "streak"], queryFn: () => apiGet<any>("/gamification/my/streak") });
}

// ── Marketplace ───────────────────────────────────────────────────────────
export function useMarketplace(params?: Record<string, any>) {
  return useQuery({ queryKey: ["marketplace", params], queryFn: () => apiGet<any>("/marketplace", params) });
}

// ── Categories ────────────────────────────────────────────────────────────
export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => apiGet<any>("/courses/categories") });
}
