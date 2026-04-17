import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Library,
  Route,
  Award,
  ShieldCheck,
  Video,
  ClipboardCheck,
  Trophy,
  ShoppingBag,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";
import { BackToDashboard } from "@/components/BackToDashboard";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  // When true, shown only to admins
  adminOnly?: boolean;
  // When true, shown to everyone EXCEPT admins (e.g. the single "Certifications"
  // item for employees — admins see "My Certifications" + "Manage Certifications" instead)
  employeeOnly?: boolean;
  // end: match the URL exactly (including query string) for active state
  end?: boolean;
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

// Nav is split into clearly-scoped sections so admins can quickly tell their
// personal learner view apart from admin-only management tools.
// For Certifications and Compliance, admins get TWO items — a "My ___" view
// (their own records) and a "Manage ___" view (org-wide admin dashboard).
const navSections: NavSection[] = [
  {
    items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "My Learning",
    items: [
      { label: "My Learning", to: "/my-learning", icon: BookOpen },
      { label: "Course Catalog", to: "/courses", icon: Library },
      { label: "Learning Paths", to: "/learning-paths", icon: Route },
      { label: "Live Training", to: "/ilt", icon: Video },
      // Employee-only single entry
      { label: "Certifications", to: "/certifications", icon: Award, employeeOnly: true },
      { label: "Compliance", to: "/compliance", icon: ShieldCheck, employeeOnly: true },
      // Admin-only: personal views (force ?view=my)
      { label: "My Certifications", to: "/certifications?view=my", icon: Award, adminOnly: true },
      { label: "My Compliance", to: "/compliance?view=my", icon: ShieldCheck, adminOnly: true },
      { label: "Leaderboard", to: "/leaderboard", icon: Trophy },
      { label: "Marketplace", to: "/marketplace", icon: ShoppingBag },
    ],
  },
  {
    heading: "Administration",
    items: [
      { label: "Analytics", to: "/analytics", icon: BarChart3, adminOnly: true },
      { label: "Manage Certifications", to: "/certifications", icon: Award, adminOnly: true },
      { label: "Manage Compliance", to: "/compliance", icon: ShieldCheck, adminOnly: true },
      { label: "Manage Quizzes", to: "/quizzes/manage", icon: ClipboardCheck, adminOnly: true },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Settings", to: "/settings", icon: Settings }],
  },
];

function UserAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
      {initials}
    </div>
  );
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();

  const isAdmin = isAdminRole(user?.role);
  const location = useLocation();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.employeeOnly && isAdmin) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  // Split a "/path?view=my" into pathname + search so we can match both parts
  // when deciding which nav item is active. Without this, "Manage Certifications"
  // (/certifications) and "My Certifications" (/certifications?view=my) would
  // both highlight on either URL.
  const isItemActive = (to: string) => {
    const [path, query = ""] = to.split("?");
    if (location.pathname !== path) return false;
    const currentQuery = location.search.replace(/^\?/, "");
    if (!query) return !currentQuery.includes("view=");
    return currentQuery === query;
  };

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const displayName = `${firstName} ${lastName}`.trim() || "User";
  const displayRole = user?.role
    ? user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Learner";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-gray-900">EmpCloud LMS</span>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, sIdx) => (
            <div key={section.heading ?? `section-${sIdx}`} className={sIdx > 0 ? "mt-5" : ""}>
              {section.heading && (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isItemActive(item.to);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? "bg-brand-50 text-brand-600"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar firstName={firstName} lastName={lastName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
              <p className="truncate text-xs text-gray-500">{displayRole}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
          <button
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>
          <BackToDashboard />
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:inline">{user?.orgName}</span>
            <div className="lg:hidden">
              <UserAvatar firstName={firstName} lastName={lastName} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
