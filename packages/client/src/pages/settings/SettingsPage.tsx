import { useState } from "react";
import { Settings, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiPut } from "@/api/client";
import { useCategories } from "@/api/hooks";

interface Preferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyDigest: boolean;
  courseCompletionAlerts: boolean;
  preferredDifficulty: string;
  preferredCategories: string[];
  language: string;
  timezone: string;
  compactView: boolean;
  darkMode: boolean;
}

const DEFAULT_PREFS: Preferences = {
  emailNotifications: true,
  pushNotifications: true,
  weeklyDigest: false,
  courseCompletionAlerts: true,
  preferredDifficulty: "intermediate",
  preferredCategories: [],
  language: "en",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  compactView: false,
  darkMode: false,
};

const DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition ${
          checked ? "bg-brand-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const { data: catData } = useCategories();
  const categories: any[] = catData?.data ?? [];

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (catId: string) => {
    setPrefs((prev) => ({
      ...prev,
      preferredCategories: prev.preferredCategories.includes(catId)
        ? prev.preferredCategories.filter((c) => c !== catId)
        : [...prev.preferredCategories, catId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPut("/users/me/preferences", prefs);
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Notification Preferences */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Notification Preferences</h2>
        <div className="divide-y divide-gray-100">
          <Toggle
            label="Email Notifications"
            description="Receive course updates and reminders via email"
            checked={prefs.emailNotifications}
            onChange={(v) => update("emailNotifications", v)}
          />
          <Toggle
            label="Push Notifications"
            description="Browser push notifications for real-time alerts"
            checked={prefs.pushNotifications}
            onChange={(v) => update("pushNotifications", v)}
          />
          <Toggle
            label="Weekly Digest"
            description="A weekly summary of your learning progress"
            checked={prefs.weeklyDigest}
            onChange={(v) => update("weeklyDigest", v)}
          />
          <Toggle
            label="Course Completion Alerts"
            description="Notify when a course or module is completed"
            checked={prefs.courseCompletionAlerts}
            onChange={(v) => update("courseCompletionAlerts", v)}
          />
        </div>
      </section>

      {/* Learning Preferences */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Learning Preferences</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Preferred Difficulty</label>
            <select
              value={prefs.preferredDifficulty}
              onChange={(e) => update("preferredDifficulty", e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {DIFFICULTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Preferred Categories
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((cat: any) => {
                  const selected = prefs.preferredCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        selected
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Display Preferences */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Display Preferences</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Language</label>
            <select
              value={prefs.language}
              onChange={(e) => update("language", e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Timezone</label>
            <input
              type="text"
              value={prefs.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="divide-y divide-gray-100">
            <Toggle
              label="Compact View"
              description="Use a denser layout with smaller cards"
              checked={prefs.compactView}
              onChange={(v) => update("compactView", v)}
            />
            <Toggle
              label="Dark Mode"
              description="Use a dark color scheme"
              checked={prefs.darkMode}
              onChange={(v) => update("darkMode", v)}
            />
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Preferences
        </button>
      </div>
    </div>
  );
}
