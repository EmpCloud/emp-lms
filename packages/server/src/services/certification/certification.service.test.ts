import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../events/index", () => ({
  lmsEvents: { emit: vi.fn() },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

// Mock puppeteer and fs so PDF generation doesn't actually run
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
}));

import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import {
  issueCertificate,
  getCertificate,
  getUserCertificates,
  getCourseCertificates,
  verifyCertificate,
  revokeCertificate,
  renewCertificate,
  checkExpiringCertificates,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "./certification.service";

const mockDB = {
  findById: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn((fn: any) => fn(mockDB)),
  updateMany: vi.fn(),
  createMany: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDB as any).mockReturnValue(mockDB);
});

// ── issueCertificate ────────────────────────────────────────────────────

describe("issueCertificate", () => {
  it("should issue a certificate for a completed enrollment", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "enr-1",
      status: "completed",
      user_id: 42,
      course_id: "course-1",
      score: 95,
    }); // enrollment
    mockDB.findOne.mockResolvedValueOnce(null); // no existing certificate
    mockDB.findById.mockResolvedValueOnce({
      id: "course-1",
      title: "Test Course",
      description: "Desc",
      certificate_template_id: null,
    }); // course
    mockDB.findOne.mockResolvedValueOnce(null); // no org default template
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      course_id: "course-1",
      enrollment_id: "enr-1",
      status: "active",
      pdf_url: null,
    });

    const result = await issueCertificate(1, 42, "course-1", "enr-1");

    expect(mockDB.create).toHaveBeenCalledWith(
      "certificates",
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        user_id: 42,
        course_id: "course-1",
        enrollment_id: "enr-1",
        status: "active",
      })
    );
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "certificate.issued",
      expect.objectContaining({
        certificateId: "test-uuid-1234",
        courseId: "course-1",
        userId: 42,
        orgId: 1,
      })
    );
    expect(result.status).toBe("active");
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(issueCertificate(1, 42, "course-1", "bad-enr")).rejects.toThrow(
      "not found"
    );
  });

  it("should throw BadRequestError when enrollment is not completed", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "enr-1",
      status: "in_progress",
      user_id: 42,
      course_id: "course-1",
    });

    await expect(
      issueCertificate(1, 42, "course-1", "enr-1")
    ).rejects.toThrow("completed");
  });

  it("should throw BadRequestError when enrollment does not match user/course", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "enr-1",
      status: "completed",
      user_id: 99,
      course_id: "other-course",
    });

    await expect(
      issueCertificate(1, 42, "course-1", "enr-1")
    ).rejects.toThrow("does not match");
  });

  it("should throw ConflictError when active certificate already exists", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "enr-1",
      status: "completed",
      user_id: 42,
      course_id: "course-1",
    });
    mockDB.findOne.mockResolvedValueOnce({ id: "existing-cert" }); // existing certificate

    await expect(
      issueCertificate(1, 42, "course-1", "enr-1")
    ).rejects.toThrow("already exists");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findById
      .mockResolvedValueOnce({
        id: "enr-1",
        status: "completed",
        user_id: 42,
        course_id: "course-1",
      })
      .mockResolvedValueOnce(null); // course not found
    mockDB.findOne.mockResolvedValueOnce(null); // no existing cert

    await expect(
      issueCertificate(1, 42, "course-1", "enr-1")
    ).rejects.toThrow("not found");
  });
});

// ── getCertificate ──────────────────────────────────────────────────────

describe("getCertificate", () => {
  it("should return certificate with enriched course info", async () => {
    mockDB.findById
      .mockResolvedValueOnce({
        id: "cert-1",
        org_id: 1,
        course_id: "course-1",
        metadata: JSON.stringify({ course_title: "Test" }),
      })
      .mockResolvedValueOnce({
        id: "course-1",
        title: "Test Course",
        slug: "test-course",
      });

    const result = await getCertificate(1, "cert-1");

    expect(result.id).toBe("cert-1");
    expect(result.metadata).toEqual({ course_title: "Test" });
    expect(result.course).toEqual({
      id: "course-1",
      title: "Test Course",
      slug: "test-course",
    });
  });

  it("should throw NotFoundError when certificate does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(getCertificate(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when certificate belongs to another org", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 999,
    });

    await expect(getCertificate(1, "cert-1")).rejects.toThrow(
      "does not belong"
    );
  });

  it("should handle null course gracefully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({
        id: "cert-1",
        org_id: 1,
        course_id: "deleted-course",
        metadata: "{}",
      })
      .mockResolvedValueOnce(null); // course deleted

    const result = await getCertificate(1, "cert-1");
    expect(result.course).toBeNull();
  });
});

// ── getUserCertificates ─────────────────────────────────────────────────

describe("getUserCertificates", () => {
  it("should return user certificates enriched with course info", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "cert-1", course_id: "c1", metadata: '{"score":90}' },
        { id: "cert-2", course_id: "c2", metadata: '{"score":85}' },
      ],
    });
    mockDB.findById
      .mockResolvedValueOnce({ id: "c1", title: "Course 1", slug: "course-1" })
      .mockResolvedValueOnce({ id: "c2", title: "Course 2", slug: "course-2" });

    const result = await getUserCertificates(1, 42);

    expect(result).toHaveLength(2);
    expect(result[0].course.title).toBe("Course 1");
    expect(result[1].metadata).toEqual({ score: 85 });
  });

  it("should return empty array when user has no certificates", async () => {
    mockDB.findMany.mockResolvedValue({ data: [] });

    const result = await getUserCertificates(1, 42);
    expect(result).toEqual([]);
  });
});

// ── getCourseCertificates ───────────────────────────────────────────────

describe("getCourseCertificates", () => {
  it("should return certificates for a course", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "cert-1", metadata: '{"score":90}' },
      ],
    });

    const result = await getCourseCertificates(1, "course-1");

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({ score: 90 });
  });
});

// ── verifyCertificate ───────────────────────────────────────────────────

describe("verifyCertificate", () => {
  it("should verify an active certificate", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      certificate_number: "CERT-1-20260101-ABC123",
      status: "active",
      issued_at: "2026-01-01",
      expires_at: null,
      course_id: "course-1",
      org_id: 1,
    });
    mockDB.findById.mockResolvedValueOnce({ id: "course-1", title: "Test Course" });

    const result = await verifyCertificate("CERT-1-20260101-ABC123");

    expect(result.is_valid).toBe(true);
    expect(result.status).toBe("active");
    expect(result.course_title).toBe("Test Course");
  });

  it("should return is_valid false for revoked certificate", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      certificate_number: "CERT-1-20260101-ABC123",
      status: "revoked",
      issued_at: "2026-01-01",
      expires_at: null,
      course_id: "course-1",
      org_id: 1,
    });
    mockDB.findById.mockResolvedValueOnce({ id: "course-1", title: "Test Course" });

    const result = await verifyCertificate("CERT-1-20260101-ABC123");

    expect(result.is_valid).toBe(false);
    expect(result.status).toBe("revoked");
  });

  it("should throw NotFoundError for unknown certificate number", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(verifyCertificate("CERT-INVALID")).rejects.toThrow("not found");
  });
});

// ── revokeCertificate ───────────────────────────────────────────────────

describe("revokeCertificate", () => {
  it("should revoke an active certificate", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 1,
      status: "active",
      certificate_number: "CERT-1",
      metadata: '{"course_title":"Test"}',
    });
    mockDB.update.mockResolvedValue({
      id: "cert-1",
      status: "revoked",
      metadata: JSON.stringify({
        course_title: "Test",
        revoked_at: expect.any(String),
        revocation_reason: "Policy violation",
      }),
    });

    const result = await revokeCertificate(1, "cert-1", "Policy violation");

    expect(mockDB.update).toHaveBeenCalledWith(
      "certificates",
      "cert-1",
      expect.objectContaining({ status: "revoked" })
    );
  });

  it("should throw NotFoundError when certificate does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(revokeCertificate(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when cert belongs to different org", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 999,
      status: "active",
    });

    await expect(revokeCertificate(1, "cert-1")).rejects.toThrow("does not belong");
  });

  it("should throw BadRequestError when certificate is already revoked", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 1,
      status: "revoked",
    });

    await expect(revokeCertificate(1, "cert-1")).rejects.toThrow("already revoked");
  });
});

// ── renewCertificate ────────────────────────────────────────────────────

describe("renewCertificate", () => {
  it("should renew an expired certificate", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-old",
      org_id: 1,
      user_id: 42,
      course_id: "course-1",
      enrollment_id: "enr-1",
      status: "expired",
      certificate_number: "CERT-OLD",
      issued_at: "2025-01-01",
      template_id: null,
    });
    mockDB.update.mockResolvedValue({ id: "cert-old", status: "expired" });
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      status: "active",
      pdf_url: null,
    });

    const result = await renewCertificate(1, "cert-old");

    expect(mockDB.create).toHaveBeenCalledWith(
      "certificates",
      expect.objectContaining({
        id: "test-uuid-1234",
        status: "active",
        user_id: 42,
        course_id: "course-1",
      })
    );
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "certificate.issued",
      expect.objectContaining({ certificateId: "test-uuid-1234" })
    );
  });

  it("should throw NotFoundError when certificate does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(renewCertificate(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when cert belongs to different org", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 999,
      status: "expired",
    });

    await expect(renewCertificate(1, "cert-1")).rejects.toThrow("does not belong");
  });

  it("should renew a revoked certificate without changing old status to expired", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-old",
      org_id: 1,
      user_id: 42,
      course_id: "course-1",
      enrollment_id: "enr-1",
      status: "revoked",
      certificate_number: "CERT-REVOKED",
      issued_at: "2025-01-01",
      template_id: null,
    });
    // For revoked certs, the old cert should NOT be updated to expired
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      status: "active",
      pdf_url: null,
    });

    const result = await renewCertificate(1, "cert-old");

    // Should NOT call update on old cert (since revoked stays revoked)
    expect(mockDB.update).not.toHaveBeenCalledWith(
      "certificates",
      "cert-old",
      expect.objectContaining({ status: "expired" })
    );
    expect(result.status).toBe("active");
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "certificate.issued",
      expect.objectContaining({ certificateId: "test-uuid-1234" })
    );
  });

  it("should throw BadRequestError when certificate is still active", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "cert-1",
      org_id: 1,
      status: "active",
    });

    await expect(renewCertificate(1, "cert-1")).rejects.toThrow("still active");
  });
});

// ── checkExpiringCertificates ───────────────────────────────────────────

describe("checkExpiringCertificates", () => {
  it("should return certificates expiring within 30 days", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "cert-1", expires_at: "2026-04-15" },
      { id: "cert-2", expires_at: "2026-04-20" },
    ]);

    const result = await checkExpiringCertificates(1);

    expect(result).toHaveLength(2);
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("expires_at"),
      expect.any(Array)
    );
  });

  it("should return empty array when no certificates are expiring", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await checkExpiringCertificates(1);
    expect(result).toEqual([]);
  });
});

// ── listTemplates ───────────────────────────────────────────────────────

describe("listTemplates", () => {
  it("should return templates for org", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "tpl-1", name: "Default" },
        { id: "tpl-2", name: "Custom" },
      ],
    });

    const result = await listTemplates(1);

    expect(result).toHaveLength(2);
    expect(mockDB.findMany).toHaveBeenCalledWith(
      "certificate_templates",
      expect.objectContaining({
        filters: { org_id: 1 },
      })
    );
  });
});

// ── getTemplate ─────────────────────────────────────────────────────────

describe("getTemplate", () => {
  it("should return template by id", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "tpl-1",
      org_id: 1,
      name: "Default Template",
    });

    const result = await getTemplate(1, "tpl-1");
    expect(result.name).toBe("Default Template");
  });

  it("should throw NotFoundError when template does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(getTemplate(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when template belongs to different org", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 999 });

    await expect(getTemplate(1, "tpl-1")).rejects.toThrow("does not belong");
  });
});

// ── createTemplate ──────────────────────────────────────────────────────

describe("createTemplate", () => {
  it("should create a template successfully", async () => {
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      name: "New Template",
      is_default: false,
    });

    const result = await createTemplate(1, { name: "New Template" });

    expect(mockDB.create).toHaveBeenCalledWith(
      "certificate_templates",
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        name: "New Template",
        is_default: false,
      })
    );
    expect(result.name).toBe("New Template");
  });

  it("should unset existing default when creating a new default template", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "old-default", is_default: true });
    mockDB.update.mockResolvedValue({});
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      is_default: true,
    });

    await createTemplate(1, { name: "New Default", is_default: true });

    expect(mockDB.update).toHaveBeenCalledWith(
      "certificate_templates",
      "old-default",
      { is_default: false }
    );
  });
});

// ── updateTemplate ──────────────────────────────────────────────────────

describe("updateTemplate", () => {
  it("should update template fields", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "tpl-1", name: "Updated Name" });

    const result = await updateTemplate(1, "tpl-1", { name: "Updated Name" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "certificate_templates",
      "tpl-1",
      expect.objectContaining({ name: "Updated Name" })
    );
    expect(result.name).toBe("Updated Name");
  });

  it("should throw NotFoundError when template does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(updateTemplate(1, "bad-id", { name: "X" })).rejects.toThrow(
      "not found"
    );
  });

  it("should throw ForbiddenError for wrong org", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 999 });

    await expect(updateTemplate(1, "tpl-1", { name: "X" })).rejects.toThrow(
      "does not belong"
    );
  });
});

// ── deleteTemplate ──────────────────────────────────────────────────────

describe("deleteTemplate", () => {
  it("should delete an unused template", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 1 });
    mockDB.count
      .mockResolvedValueOnce(0) // certificates using template
      .mockResolvedValueOnce(0); // courses using template
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteTemplate(1, "tpl-1");

    expect(result).toEqual({ deleted: true });
    expect(mockDB.delete).toHaveBeenCalledWith("certificate_templates", "tpl-1");
  });

  it("should throw NotFoundError when template does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(deleteTemplate(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError for wrong org", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 999 });

    await expect(deleteTemplate(1, "tpl-1")).rejects.toThrow("does not belong");
  });

  it("should throw BadRequestError when template is used by certificates", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 1 });
    mockDB.count.mockResolvedValueOnce(3); // 3 certificates using it

    await expect(deleteTemplate(1, "tpl-1")).rejects.toThrow("Cannot delete template");
  });

  it("should throw BadRequestError when template is assigned to courses", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", org_id: 1 });
    mockDB.count
      .mockResolvedValueOnce(0) // no certificates
      .mockResolvedValueOnce(2); // 2 courses

    await expect(deleteTemplate(1, "tpl-1")).rejects.toThrow("Cannot delete template");
  });
});
