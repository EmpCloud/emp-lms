import { Trophy, Flame, Loader2, Star } from "lucide-react";
import { useLeaderboard, useMyPoints } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const PODIUM_STYLES: Record<number, { ring: string; bg: string; text: string }> = {
  1: { ring: "ring-yellow-400", bg: "bg-yellow-400", text: "text-yellow-700" },
  2: { ring: "ring-gray-400", bg: "bg-gray-300", text: "text-gray-600" },
  3: { ring: "ring-amber-600", bg: "bg-amber-600", text: "text-amber-800" },
};

export default function LeaderboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: lbData, isLoading: lbLoading } = useLeaderboard();
  const { data: ptsData, isLoading: ptsLoading } = useMyPoints();

  const leaders: any[] = lbData?.data ?? [];
  const myPoints = ptsData?.data as any;

  if (lbLoading || ptsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const top3 = leaders.slice(0, 3);
  const podiumOrder = [1, 0, 2]; // silver, gold, bronze visual order

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
      </div>

      {/* Current User Stats */}
      {myPoints && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-brand-600" />
            <span className="text-sm font-medium text-brand-900">
              Your Points: <span className="text-lg font-bold">{myPoints.totalPoints?.toLocaleString() ?? 0}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-brand-600" />
            <span className="text-sm font-medium text-brand-900">
              Rank: <span className="text-lg font-bold">#{myPoints.rank ?? "\u2014"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium text-brand-900">
              Streak: <span className="text-lg font-bold">{myPoints.streak ?? 0} days</span>
            </span>
          </div>
        </div>
      )}

      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-4 py-4">
          {podiumOrder.map((idx) => {
            const entry = top3[idx];
            if (!entry) return <div key={idx} className="w-28" />;
            const rank = idx + 1;
            const style = PODIUM_STYLES[rank];
            const isMe = entry.userId === user?.empcloudUserId;
            return (
              <div
                key={entry.userId ?? idx}
                className={`flex flex-col items-center ${rank === 1 ? "mb-4" : ""}`}
              >
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full ring-4 ${style.ring} ${
                    isMe ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-700"
                  } text-lg font-bold`}
                >
                  {initials(entry.name ?? "?")}
                </div>
                <span className={`mt-2 rounded-full px-2 py-0.5 text-xs font-bold ${style.bg} ${style.text}`}>
                  #{rank}
                </span>
                <p className={`mt-1 text-sm font-semibold ${isMe ? "text-brand-600" : "text-gray-900"}`}>
                  {entry.name}
                </p>
                <p className="text-xs text-gray-500">{entry.points?.toLocaleString()} pts</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Table */}
      {leaders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Trophy className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No leaderboard data yet</h3>
          <p className="mt-1 text-sm text-gray-500">Start learning to appear on the leaderboard!</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Learner
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Points
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Courses Completed
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Streak
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leaders.map((entry: any, idx: number) => {
                const rank = idx + 1;
                const isMe = entry.userId === user?.empcloudUserId;
                return (
                  <tr
                    key={entry.userId ?? idx}
                    className={isMe ? "bg-brand-50" : "hover:bg-gray-50"}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-gray-900">
                      {rank <= 3 ? (
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${
                            rank === 1
                              ? "bg-yellow-400"
                              : rank === 2
                                ? "bg-gray-400"
                                : "bg-amber-600"
                          }`}
                        >
                          {rank}
                        </span>
                      ) : (
                        <span className="text-gray-500">{rank}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                            isMe
                              ? "bg-brand-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {initials(entry.name ?? "?")}
                        </div>
                        <span className={`font-medium ${isMe ? "text-brand-600" : "text-gray-900"}`}>
                          {entry.name}
                          {isMe && (
                            <span className="ml-1.5 text-xs text-brand-500">(You)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900">
                      {entry.points?.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {entry.coursesCompleted ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        {entry.streak ?? 0}d
                      </span>
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
