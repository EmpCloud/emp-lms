import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Plus, Loader2, Eye, Trash2, Edit } from "lucide-react";
import { useAllQuizzes } from "@/api/hooks";
import { apiDelete } from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

function typeBadge(type: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    graded: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Graded" },
    practice: { bg: "bg-green-100", text: "text-green-700", label: "Practice" },
    survey: { bg: "bg-amber-100", text: "text-amber-700", label: "Survey" },
  };
  const s = map[type] ?? map.graded;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default function QuizManagePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data, isLoading } = useAllQuizzes();
  const quizzes: any[] = data?.data ?? [];

  if (!isAdminRole(user?.role)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <ClipboardCheck className="h-12 w-12 text-gray-400" />
        <h2 className="mt-4 text-lg font-medium text-gray-900">Access Restricted</h2>
        <p className="mt-1 text-sm text-gray-500">Quiz management is available to administrators only.</p>
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

  const handleDelete = async (quizId: string) => {
    if (!confirm("Are you sure you want to delete this quiz?")) return;
    setDeleting(quizId);
    try {
      await apiDelete(`/quizzes/${quizId}`);
      toast.success("Quiz deleted");
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    } catch {
      toast.error("Failed to delete quiz");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Quiz Management</h1>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ClipboardCheck className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No quizzes yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create quizzes from the course builder.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Passing Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time Limit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {quizzes.map((quiz: any) => (
                <tr key={quiz.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {quiz.title}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {typeBadge(quiz.type ?? "graded")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {quiz.passing_score ?? 70}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : "No limit"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/quizzes/${quiz.id}`)}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(quiz.id)}
                        disabled={deleting === quiz.id}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === quiz.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
