import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Award,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Loader2,
  ShieldCheck,
  Search,
  X,
  User as UserIcon,
} from "lucide-react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import {
  useMyCertificates,
  useAllCertificates,
  useVerifyCertificateByNumber,
} from "@/api/hooks";
import CertificateDownload from "@/components/lms/CertificateDownload";
import { useAuthStore, isAdminRole } from "@/lib/auth-store";

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
          <ShieldCheck className="h-3 w-3" /> Active
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
          <XCircle className="h-3 w-3" /> Expired
        </span>
      );
    case "revoked":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          <XCircle className="h-3 w-3" /> Revoked
        </span>
      );
    default:
      return null;
  }
}

function isExpiringSoon(expiryDate: string | null) {
  if (!expiryDate) return false;
  return dayjs(expiryDate).diff(dayjs(), "day") <= 30 && dayjs(expiryDate).isAfter(dayjs());
}

/* ── Verify Certificate Dialog ──────────────────────────────────────────── */
function VerifyCertificateDialog({ onClose }: { onClose: () => void }) {
  const [certNumber, setCertNumber] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const verifyMutation = useVerifyCertificateByNumber();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certNumber.trim()) {
      toast.error("Enter a certificate number");
      return;
    }
    setResult(null);
    setNotFound(false);
    try {
      const res = await verifyMutation.mutateAsync(certNumber.trim());
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        style={{ maxWidth: "480px" }}
        className="w-full rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-100 p-1.5">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Verify Certificate</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <form onSubmit={handleVerify} className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Certificate Number
            </label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="e.g. CERT-2026-0001"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={verifyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Verify
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Paste a certificate number to check if it&apos;s valid, active, expired, or revoked.
            </p>
          </form>

          {notFound && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-red-700 font-medium">Certificate not found</span>
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                {result.is_valid ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">Certificate is Valid</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-semibold text-red-700">Certificate is Not Valid</span>
                  </>
                )}
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Number</dt>
                  <dd className="font-mono text-gray-800">{result.certificate_number}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Status</dt>
                  <dd className="capitalize text-gray-800">{result.status}</dd>
                </div>
                {result.course_title && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Course</dt>
                    <dd className="text-gray-800">{result.course_title}</dd>
                  </div>
                )}
                {result.issued_at && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Issued</dt>
                    <dd className="text-gray-800">{dayjs(result.issued_at).format("MMM D, YYYY")}</dd>
                  </div>
                )}
                {result.expires_at && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Expires</dt>
                    <dd className="text-gray-800">{dayjs(result.expires_at).format("MMM D, YYYY")}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Certificate Card ───────────────────────────────────────────────────── */
function CertCard({ cert, showOwner, isAdmin }: { cert: any; showOwner?: boolean; isAdmin: boolean }) {
  return (
    <div className="relative flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {isExpiringSoon(cert.expiryDate) && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3 w-3" /> Expiring soon
        </div>
      )}

      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
          {cert.courseName}
        </h3>
        {statusBadge(cert.status)}
      </div>

      {showOwner && cert.userName && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-600">
          <UserIcon className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{cert.userName}</span>
          {cert.userEmail && <span className="text-gray-400">· {cert.userEmail}</span>}
        </div>
      )}

      <dl className="flex-1 space-y-1 text-sm text-gray-500">
        <div className="flex justify-between">
          <dt>Certificate #</dt>
          <dd className="font-mono text-xs text-gray-700">{cert.certificateNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Issued</dt>
          <dd>{dayjs(cert.issuedDate).format("MMM D, YYYY")}</dd>
        </div>
        {cert.expiryDate && (
          <div className="flex justify-between">
            <dt>Expires</dt>
            <dd
              className={
                isExpiringSoon(cert.expiryDate)
                  ? "font-medium text-amber-600"
                  : dayjs(cert.expiryDate).isBefore(dayjs())
                    ? "font-medium text-red-600"
                    : ""
              }
            >
              {dayjs(cert.expiryDate).format("MMM D, YYYY")}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4">
        <CertificateDownload certificateId={cert.id} showVerify={isAdmin} />
      </div>
    </div>
  );
}

/* ── Admin View: all org certificates + verify by number ────────────────── */
function AdminCertificationsView() {
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAllCertificates({ limit: 100 });

  const allCerts: any[] = data?.data?.data ?? data?.data ?? [];

  const filtered = search.trim()
    ? allCerts.filter((c: any) => {
        const q = search.toLowerCase();
        return (
          c.certificateNumber?.toLowerCase().includes(q) ||
          c.courseName?.toLowerCase().includes(q) ||
          c.userName?.toLowerCase().includes(q) ||
          c.userEmail?.toLowerCase().includes(q)
        );
      })
    : allCerts;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Award className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Certifications</h1>
            <p className="text-sm text-gray-500">
              {allCerts.length} certificate{allCerts.length === 1 ? "" : "s"} issued across your organization
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowVerifyDialog(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <ShieldCheck className="h-4 w-4" />
          Verify Certificate
        </button>
      </div>

      {allCerts.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by certificate number, course, employee name or email..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Award className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            {allCerts.length === 0 ? "No certificates issued yet" : "No matches found"}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {allCerts.length === 0
              ? "Certificates will appear here once learners complete their courses."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cert: any) => (
            <CertCard key={cert.id} cert={cert} showOwner isAdmin />
          ))}
        </div>
      )}

      {showVerifyDialog && <VerifyCertificateDialog onClose={() => setShowVerifyDialog(false)} />}
    </div>
  );
}

/* ── Employee View: own certificates ────────────────────────────────────── */
function EmployeeCertificationsView() {
  const { data, isLoading } = useMyCertificates();
  const certificates: any[] = data?.data ?? [];

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
        <Award className="h-7 w-7 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">My Certifications</h1>
      </div>

      {certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Award className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No certificates yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Complete courses to earn your first certification.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert: any) => (
            <CertCard key={cert.id} cert={cert} isAdmin={false} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */
export default function CertificationsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);
  const [searchParams] = useSearchParams();
  // ?view=my forces the personal view even for admins — used by the
  // "My Certifications" menu item in the sidebar.
  const viewMode = searchParams.get("view");

  if (isAdmin && viewMode !== "my") {
    return <AdminCertificationsView />;
  }
  return <EmployeeCertificationsView />;
}
