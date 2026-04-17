import { Award, AlertTriangle, XCircle, Loader2, ShieldCheck } from "lucide-react";
import dayjs from "dayjs";
import { useMyCertificates } from "@/api/hooks";
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

export default function CertificationsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);
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
            <div
              key={cert.id}
              className="relative flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              {isExpiringSoon(cert.expiryDate) && (
                <div className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> Expiring soon
                </div>
              )}

              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                  {cert.courseName}
                </h3>
                {statusBadge(cert.status)}
              </div>

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
          ))}
        </div>
      )}
    </div>
  );
}
