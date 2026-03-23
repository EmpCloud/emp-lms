import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Plus,
  Pin,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  MessageCircle,
  X,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useCourses, useDiscussions } from "@/api/hooks";
import { apiPost, apiPatch, apiDelete } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

const ITEMS_PER_PAGE = 10;

export default function DiscussionsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const queryClient = useQueryClient();

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [page, setPage] = useState(1);

  // New discussion form state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newLessonId, setNewLessonId] = useState("");

  // Reply state
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: coursesRes, isLoading: coursesLoading } = useCourses();
  const { data: discussionsRes, isLoading: discussionsLoading } =
    useDiscussions(selectedCourseId);

  const courses = coursesRes?.data ?? [];
  const allDiscussions: any[] = Array.isArray(discussionsRes?.data)
    ? discussionsRes.data
    : [];

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(allDiscussions.length / ITEMS_PER_PAGE));
  const discussions = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return allDiscussions.slice(start, start + ITEMS_PER_PAGE);
  }, [allDiscussions, page]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["discussions", selectedCourseId] });

  // ── Create discussion ──────────────────────────────────────────────────
  async function handleCreateDiscussion(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || !selectedCourseId) return;
    setSubmitting(true);
    try {
      const body: any = {
        course_id: selectedCourseId,
        title: newTitle.trim(),
        content: newContent.trim(),
      };
      if (newLessonId) body.lesson_id = newLessonId;
      await apiPost("/discussions", body);
      toast.success("Discussion created");
      setNewTitle("");
      setNewContent("");
      setNewLessonId("");
      setShowNewForm(false);
      invalidate();
    } catch {
      toast.error("Failed to create discussion");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reply ──────────────────────────────────────────────────────────────
  async function handleReply(discussionId: string) {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await apiPost(`/discussions/${discussionId}/replies`, {
        content: replyContent.trim(),
      });
      toast.success("Reply posted");
      setReplyContent("");
      invalidate();
    } catch {
      toast.error("Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Pin / Resolve ──────────────────────────────────────────────────────
  async function handleTogglePin(id: string, currentPinned: boolean) {
    try {
      await apiPatch(`/discussions/${id}`, { pinned: !currentPinned });
      toast.success(currentPinned ? "Unpinned" : "Pinned");
      invalidate();
    } catch {
      toast.error("Failed to update discussion");
    }
  }

  async function handleToggleResolved(id: string, currentResolved: boolean) {
    try {
      await apiPatch(`/discussions/${id}`, { resolved: !currentResolved });
      toast.success(currentResolved ? "Marked unresolved" : "Marked resolved");
      invalidate();
    } catch {
      toast.error("Failed to update discussion");
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this discussion?")) return;
    try {
      await apiDelete(`/discussions/${id}`);
      toast.success("Discussion deleted");
      if (expandedThread === id) setExpandedThread(null);
      invalidate();
    } catch {
      toast.error("Failed to delete discussion");
    }
  }

  async function handleDeleteReply(discussionId: string, replyId: string) {
    if (!confirm("Delete this reply?")) return;
    try {
      await apiDelete(`/discussions/${discussionId}/replies/${replyId}`);
      toast.success("Reply deleted");
      invalidate();
    } catch {
      toast.error("Failed to delete reply");
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function formatDate(dateStr: string) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function canDelete(authorId: number | string | undefined) {
    return isAdmin || String(authorId) === String(user?.empcloudUserId);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-brand-600" />
            Discussions
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ask questions and share ideas with your peers
          </p>
        </div>

        {selectedCourseId && (
          <button
            onClick={() => setShowNewForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            {showNewForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNewForm ? "Cancel" : "New Discussion"}
          </button>
        )}
      </div>

      {/* Course selector */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label
          htmlFor="course-select"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Select Course
        </label>
        <select
          id="course-select"
          value={selectedCourseId}
          onChange={(e) => {
            setSelectedCourseId(e.target.value);
            setExpandedThread(null);
            setShowNewForm(false);
            setPage(1);
          }}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">-- Choose a course --</option>
          {coursesLoading && <option disabled>Loading courses...</option>}
          {(Array.isArray(courses) ? courses : []).map((c: any) => (
            <option key={c.id ?? c._id} value={c.id ?? c._id}>
              {c.title ?? c.name}
            </option>
          ))}
        </select>
      </div>

      {/* New discussion form */}
      {showNewForm && selectedCourseId && (
        <form
          onSubmit={handleCreateDiscussion}
          className="rounded-lg border border-brand-200 bg-brand-50 p-5 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">Start a New Discussion</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Discussion title"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="What would you like to discuss?"
              required
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lesson (optional)
            </label>
            <input
              type="text"
              value={newLessonId}
              onChange={(e) => setNewLessonId(e.target.value)}
              placeholder="Lesson ID (optional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post Discussion
            </button>
          </div>
        </form>
      )}

      {/* Discussion threads */}
      {!selectedCourseId ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
          <MessageCircle className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">Select a course to view discussions</p>
        </div>
      ) : discussionsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : discussions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
          <MessageCircle className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">No discussions yet</p>
          <p className="text-sm text-gray-400">Be the first to start a conversation!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {discussions.map((thread: any) => {
            const id = thread.id ?? thread._id;
            const isExpanded = expandedThread === id;
            const replies: any[] = thread.replies ?? [];

            return (
              <div
                key={id}
                className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
              >
                {/* Thread header */}
                <button
                  type="button"
                  onClick={() => setExpandedThread(isExpanded ? null : id)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {thread.title}
                        </h3>
                        {thread.pinned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <Pin className="h-3 w-3" /> Pinned
                          </span>
                        )}
                        {thread.resolved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                        {thread.content}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                        <span className="font-medium text-gray-600">
                          {thread.author_name ??
                            thread.authorName ??
                            thread.author?.name ??
                            "Unknown"}
                        </span>
                        <span>{formatDate(thread.created_at ?? thread.createdAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {replies.length} {replies.length === 1 ? "reply" : "replies"}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                    )}
                  </div>
                </button>

                {/* Expanded thread */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50">
                    {/* Admin actions */}
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => handleTogglePin(id, !!thread.pinned)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <Pin className="h-3.5 w-3.5" />
                            {thread.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            onClick={() =>
                              handleToggleResolved(id, !!thread.resolved)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {thread.resolved ? "Unresolve" : "Resolve"}
                          </button>
                        </>
                      )}
                      {canDelete(thread.author_id ?? thread.authorId ?? thread.author?.id) && (
                        <button
                          onClick={() => handleDelete(id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Replies */}
                    {replies.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700">Replies</h4>
                        {replies.map((reply: any) => {
                          const replyId = reply.id ?? reply._id;
                          return (
                            <div
                              key={replyId}
                              className="rounded-md border border-gray-200 bg-white px-4 py-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-gray-800">{reply.content}</p>
                                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                                    <span className="font-medium text-gray-600">
                                      {reply.author_name ??
                                        reply.authorName ??
                                        reply.author?.name ??
                                        "Unknown"}
                                    </span>
                                    <span>
                                      {formatDate(reply.created_at ?? reply.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                {canDelete(
                                  reply.author_id ?? reply.authorId ?? reply.author?.id
                                ) && (
                                  <button
                                    onClick={() => handleDeleteReply(id, replyId)}
                                    className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Delete reply"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply form */}
                    <div className="flex gap-2">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <button
                        onClick={() => handleReply(id)}
                        disabled={submitting || !replyContent.trim()}
                        className="self-end inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
