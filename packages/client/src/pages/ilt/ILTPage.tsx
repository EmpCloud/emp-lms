import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Link as LinkIcon,
  Users,
  Loader2,
  Clock,
  UserCheck,
} from "lucide-react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { useILTSessions } from "@/api/hooks";
import { apiPost } from "@/api/client";

type Tab = "upcoming" | "past" | "my";

function sessionStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: "bg-green-100", text: "text-green-700", label: "Open" },
    full: { bg: "bg-amber-100", text: "text-amber-700", label: "Full" },
    completed: { bg: "bg-gray-100", text: "text-gray-600", label: "Completed" },
    cancelled: { bg: "bg-red-100", text: "text-red-700", label: "Cancelled" },
    registered: { bg: "bg-blue-100", text: "text-blue-700", label: "Registered" },
  };
  const s = map[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default function ILTPage() {
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const { data, isLoading, refetch } = useILTSessions({ tab: activeTab });
  const sessions: any[] = data?.data ?? [];

  const handleRegister = async (sessionId: string) => {
    try {
      await apiPost(`/ilt/${sessionId}/register`);
      toast.success("Successfully registered!");
      refetch();
    } catch {
      toast.error("Registration failed");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "my", label: "My Sessions" },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Instructor-Led Training</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition ${
                activeTab === t.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <CalendarDays className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No sessions found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === "upcoming"
              ? "There are no upcoming sessions at this time."
              : activeTab === "past"
                ? "No past sessions to show."
                : "You haven't registered for any sessions yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session: any) => (
            <div
              key={session.id}
              className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                  {session.title}
                </h3>
                {sessionStatusBadge(session.status)}
              </div>

              <dl className="flex-1 space-y-2 text-sm text-gray-500">
                {session.instructor && (
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-gray-400" />
                    <span>{session.instructor}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>
                    {dayjs(session.startTime).format("MMM D, YYYY h:mm A")}
                    {session.endTime && ` - ${dayjs(session.endTime).format("h:mm A")}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {session.location ? (
                    <>
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span>{session.location}</span>
                    </>
                  ) : session.url ? (
                    <>
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                      <a
                        href={session.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        Virtual session link
                      </a>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span>
                    {session.enrolled ?? 0}/{session.maxCapacity ?? "\u221E"} enrolled
                  </span>
                </div>
              </dl>

              {activeTab === "upcoming" && session.status === "open" && (
                <button
                  onClick={() => handleRegister(session.id)}
                  className="mt-4 w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
                >
                  Register
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
