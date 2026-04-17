import { useState } from "react";
import { Download, Printer, ShieldCheck, Loader2, X, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api, apiGet } from "@/api/client";

interface VerifyResult {
  valid: boolean;
  holder?: string;
  courseName?: string;
  issuedDate?: string;
  expiryDate?: string;
  status?: string;
}

interface CertificateDownloadProps {
  certificateId: string;
  className?: string;
}

export default function CertificateDownload({ certificateId, className = "" }: CertificateDownloadProps) {
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [showVerify, setShowVerify] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await api.get(`/certificates/${certificateId}/pdf`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `certificate-${certificateId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Certificate downloaded");
    } catch {
      toast.error("Failed to download certificate");
    } finally {
      setDownloading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setShowVerify(true);
    try {
      const res = await apiGet<VerifyResult>(`/certificates/${certificateId}/verify`);
      if (res.success && res.data) {
        setVerifyResult(res.data);
      } else {
        setVerifyResult({ valid: false });
      }
    } catch {
      toast.error("Verification request failed");
      setVerifyResult({ valid: false });
    } finally {
      setVerifying(false);
    }
  };

  const closeVerify = () => {
    setShowVerify(false);
    setVerifyResult(null);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        {/* Download PDF button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 transition disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download
        </button>

        {/* Print button — opens the certificate HTML in a new window and
            triggers the browser print dialog. */}
        <button
          onClick={async () => {
            try {
              const response = await api.get(`/certificates/${certificateId}/download`, {
                responseType: "text",
              });
              const html = typeof response.data === "string" ? response.data : response.data?.html || "";
              const win = window.open("", "_blank", "width=900,height=700");
              if (win) {
                win.document.write(html || "<p>Certificate preview not available</p>");
                win.document.close();
                setTimeout(() => win.print(), 500);
              }
            } catch {
              toast.error("Failed to load certificate for printing");
            }
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={verifying && showVerify}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {verifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          Verify
        </button>
      </div>

      {/* Verification result card */}
      {showVerify && (
        <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          {verifying ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              <span className="ml-2 text-sm text-gray-500">Verifying...</span>
            </div>
          ) : verifyResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {verifyResult.valid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span
                    className={`text-sm font-semibold ${
                      verifyResult.valid ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {verifyResult.valid ? "Certificate Valid" : "Certificate Invalid"}
                  </span>
                </div>
                <button
                  onClick={closeVerify}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {verifyResult.valid && (
                <dl className="space-y-1 text-xs text-gray-600">
                  {verifyResult.holder && (
                    <div className="flex justify-between">
                      <dt className="font-medium">Holder</dt>
                      <dd>{verifyResult.holder}</dd>
                    </div>
                  )}
                  {verifyResult.courseName && (
                    <div className="flex justify-between">
                      <dt className="font-medium">Course</dt>
                      <dd>{verifyResult.courseName}</dd>
                    </div>
                  )}
                  {verifyResult.issuedDate && (
                    <div className="flex justify-between">
                      <dt className="font-medium">Issued</dt>
                      <dd>{verifyResult.issuedDate}</dd>
                    </div>
                  )}
                  {verifyResult.status && (
                    <div className="flex justify-between">
                      <dt className="font-medium">Status</dt>
                      <dd className="capitalize">{verifyResult.status}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
