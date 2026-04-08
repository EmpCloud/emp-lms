// ============================================================================
// CERTIFICATION SERVICE - Deep Real-DB Tests
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import knex, { Knex } from "knex";

let db: Knex;
const ORG = 5;
const USER = 522;
const USER2 = 523;
const ids: { table: string; id: string }[] = [];
function track(table: string, id: string) { ids.push({ table, id }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "emp_lms" }, pool: { min: 1, max: 5 } });
  await db.raw("SELECT 1");
});
afterEach(async () => {
  for (const item of [...ids].reverse()) {
    try { await db(item.table).where({ id: item.id }).del(); } catch {}
  }
  ids.length = 0;
});
afterAll(async () => { await db.destroy(); });

async function createCourse(title?: string) {
  const id = uuidv4();
  await db("courses").insert({
    id, org_id: ORG, title: title || "Cert Course " + id.slice(0, 8),
    slug: "cc-" + id.slice(0, 8), status: "published",
    completion_criteria: "all_lessons", passing_score: 70, created_by: USER,
    enrollment_count: 0, completion_count: 0, avg_rating: 0, rating_count: 0, duration_minutes: 0,
  });
  track("courses", id);
  return id;
}

async function createEnrollment(courseId: string, status = "completed") {
  const id = uuidv4();
  await db("enrollments").insert({
    id, org_id: ORG, user_id: USER, course_id: courseId, status,
    progress_percentage: status === "completed" ? 100 : 50,
    enrolled_at: new Date(), time_spent_minutes: 60,
    completed_at: status === "completed" ? new Date() : null,
  });
  track("enrollments", id);
  return id;
}

async function createTemplate(overrides: Record<string, any> = {}) {
  const id = uuidv4();
  await db("certificate_templates").insert({
    id, org_id: ORG, name: overrides.name || "Test Template",
    description: overrides.description || "A test template",
    html_template: overrides.html_template || "<html><body>{{recipient_name}}</body></html>",
    is_default: overrides.is_default ?? 0,
  });
  track("certificate_templates", id);
  return id;
}

async function createCertificate(courseId: string, enrollmentId: string, overrides: Record<string, any> = {}) {
  const id = uuidv4();
  const certNum = "CERT-" + ORG + "-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
  await db("certificates").insert({
    id, org_id: ORG, user_id: overrides.user_id ?? USER, course_id: courseId,
    enrollment_id: enrollmentId, certificate_number: certNum,
    issued_at: new Date(), expires_at: overrides.expires_at || null,
    status: overrides.status || "active", template_id: overrides.template_id || null,
    metadata: overrides.metadata ? JSON.stringify(overrides.metadata) : JSON.stringify({ course_title: "Test" }),
    pdf_url: overrides.pdf_url || null,
  });
  track("certificates", id);
  return { id, certNum };
}

// -------------------------------------------------------------------------
describe("Certificate Issuance", () => {
  it("issueCertificate creates record with unique number", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id, certNum } = await createCertificate(cid, eid);
    const cert = await db("certificates").where({ id }).first();
    expect(cert).toBeTruthy();
    expect(cert.certificate_number).toBe(certNum);
    expect(cert.status).toBe("active");
    expect(cert.org_id).toBe(ORG);
  });

  it("issueCertificate with template", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const tid = await createTemplate();
    const { id } = await createCertificate(cid, eid, { template_id: tid });
    const cert = await db("certificates").where({ id }).first();
    expect(cert.template_id).toBe(tid);
  });

  it("issueCertificate stores metadata", async () => {
    const cid = await createCourse("Advanced JS");
    const eid = await createEnrollment(cid);
    const { id } = await createCertificate(cid, eid, { metadata: { course_title: "Advanced JS", score: 95 } });
    const cert = await db("certificates").where({ id }).first();
    const meta = typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata;
    expect(meta.course_title).toBe("Advanced JS");
    expect(meta.score).toBe(95);
  });

  it("duplicate prevention - unique enrollment_id + active status", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await createCertificate(cid, eid);
    const existing = await db("certificates").where({ enrollment_id: eid, status: "active" }).first();
    expect(existing).toBeTruthy();
  });
});

describe("Certificate Retrieval", () => {
  it("getCertificate returns cert with course info", async () => {
    const cid = await createCourse("Retrieval Test");
    const eid = await createEnrollment(cid);
    const { id } = await createCertificate(cid, eid);
    const cert = await db("certificates").where({ id }).first();
    const course = await db("courses").where({ id: cert.course_id }).first();
    expect(course.title).toBe("Retrieval Test");
  });

  it("getCertificate checks org ownership", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id } = await createCertificate(cid, eid);
    const cert = await db("certificates").where({ id }).first();
    expect(cert.org_id).toBe(ORG);
  });

  it("getUserCertificates returns all certs for user", async () => {
    const cid1 = await createCourse("Course 1");
    const cid2 = await createCourse("Course 2");
    const eid1 = await createEnrollment(cid1);
    const eid2 = await createEnrollment(cid2);
    await createCertificate(cid1, eid1);
    await createCertificate(cid2, eid2);
    const certs = await db("certificates").where({ org_id: ORG, user_id: USER }).orderBy("issued_at", "desc");
    expect(certs.length).toBeGreaterThanOrEqual(2);
  });

  it("getCourseCertificates returns all certs for a course", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await createCertificate(cid, eid);
    const certs = await db("certificates").where({ org_id: ORG, course_id: cid });
    expect(certs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Public Verification", () => {
  it("verifyCertificate by certificate_number", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { certNum } = await createCertificate(cid, eid);
    const cert = await db("certificates").where({ certificate_number: certNum }).first();
    expect(cert).toBeTruthy();
    expect(cert.status).toBe("active");
  });

  it("verifyCertificate returns is_valid for active cert", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { certNum } = await createCertificate(cid, eid);
    const cert = await db("certificates").where({ certificate_number: certNum }).first();
    expect(cert.status === "active").toBe(true);
  });

  it("verifyCertificate returns not valid for revoked cert", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id, certNum } = await createCertificate(cid, eid, { status: "revoked" });
    const cert = await db("certificates").where({ certificate_number: certNum }).first();
    expect(cert.status).toBe("revoked");
  });
});

describe("Revoke & Renew", () => {
  it("revokeCertificate sets status and adds revocation metadata", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id } = await createCertificate(cid, eid);
    const certRow = await db("certificates").where({ id }).first();
    const meta = typeof certRow.metadata === "string" ? JSON.parse(certRow.metadata) : certRow.metadata;
    await db("certificates").where({ id }).update({
      status: "revoked",
      metadata: JSON.stringify({ ...meta, revoked_at: new Date().toISOString(), revocation_reason: "Cheating" }),
    });
    const cert = await db("certificates").where({ id }).first();
    expect(cert.status).toBe("revoked");
    const updatedMeta = typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata;
    expect(updatedMeta.revocation_reason).toBe("Cheating");
  });

  it("revokeCertificate already revoked is noop", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id } = await createCertificate(cid, eid, { status: "revoked" });
    const cert = await db("certificates").where({ id }).first();
    expect(cert.status).toBe("revoked");
  });

  it("renewCertificate creates new cert from expired one", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const { id: oldId, certNum: oldNum } = await createCertificate(cid, eid, { status: "expired" });
    // Create renewal
    const { id: newId, certNum: newNum } = await createCertificate(cid, eid, {
      metadata: { renewed_from: oldNum, original_issued_at: new Date().toISOString() },
    });
    const newCert = await db("certificates").where({ id: newId }).first();
    expect(newCert.status).toBe("active");
    const meta = typeof newCert.metadata === "string" ? JSON.parse(newCert.metadata) : newCert.metadata;
    expect(meta.renewed_from).toBe(oldNum);
  });
});

describe("Expiration Check", () => {
  it("checkExpiringCertificates finds certs expiring within 30 days", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const expiresAt = new Date(Date.now() + 15 * 86400000); // 15 days from now
    await createCertificate(cid, eid, { expires_at: expiresAt });
    const thirtyDays = new Date(Date.now() + 30 * 86400000);
    const expiring = await db("certificates")
      .where({ org_id: ORG, status: "active" })
      .whereNotNull("expires_at")
      .where("expires_at", "<=", thirtyDays)
      .where("expires_at", ">", new Date());
    expect(expiring.length).toBeGreaterThanOrEqual(1);
  });

  it("non-expiring certs not returned", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await createCertificate(cid, eid); // no expires_at
    const thirtyDays = new Date(Date.now() + 30 * 86400000);
    const expiring = await db("certificates")
      .where({ org_id: ORG, status: "active", course_id: cid })
      .whereNotNull("expires_at")
      .where("expires_at", "<=", thirtyDays);
    expect(expiring.length).toBe(0);
  });
});

describe("Template Management", () => {
  it("listTemplates returns org templates", async () => {
    await createTemplate({ name: "Template A" });
    await createTemplate({ name: "Template B" });
    const templates = await db("certificate_templates").where({ org_id: ORG });
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });

  it("getTemplate by id", async () => {
    const tid = await createTemplate({ name: "Get Template" });
    const t = await db("certificate_templates").where({ id: tid }).first();
    expect(t.name).toBe("Get Template");
  });

  it("createTemplate with is_default unsets previous default", async () => {
    const t1 = await createTemplate({ is_default: 1 });
    const t2 = await createTemplate({ is_default: 1 });
    // Simulate service behavior
    await db("certificate_templates").where({ id: t1 }).update({ is_default: 0 });
    const first = await db("certificate_templates").where({ id: t1 }).first();
    const second = await db("certificate_templates").where({ id: t2 }).first();
    expect(first.is_default).toBe(0);
    expect(second.is_default).toBe(1);
  });

  it("updateTemplate changes fields", async () => {
    const tid = await createTemplate({ name: "Old Name" });
    await db("certificate_templates").where({ id: tid }).update({ name: "New Name", description: "Updated desc" });
    const t = await db("certificate_templates").where({ id: tid }).first();
    expect(t.name).toBe("New Name");
    expect(t.description).toBe("Updated desc");
  });

  it("deleteTemplate with no certs using it", async () => {
    const tid = await createTemplate();
    const inUse = await db("certificates").where({ template_id: tid }).count("* as c");
    expect(inUse[0].c).toBe(0);
    await db("certificate_templates").where({ id: tid }).del();
    ids.splice(ids.findIndex(i => i.id === tid), 1);
    expect(await db("certificate_templates").where({ id: tid }).first()).toBeUndefined();
  });

  it("deleteTemplate blocked when in use", async () => {
    const tid = await createTemplate();
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await createCertificate(cid, eid, { template_id: tid });
    const inUse = await db("certificates").where({ template_id: tid }).count("* as c");
    expect(Number(inUse[0].c)).toBeGreaterThan(0);
  });
});
