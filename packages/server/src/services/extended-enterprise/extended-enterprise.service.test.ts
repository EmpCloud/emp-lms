import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

import { getDB } from "../../db/adapters/index";
import {
  createExternalPortal,
  inviteExternalUser,
  getExternalUsers,
  assignCoursesToPortal,
  getPortalCourses,
} from "./extended-enterprise.service";

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

// -- createExternalPortal ------------------------------------------------------

describe("createExternalPortal", () => {
  it("should create a portal successfully", async () => {
    mockDB.raw.mockResolvedValueOnce([]); // no slug conflict
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    const result = await createExternalPortal(1, {
      name: "Partner Portal",
    });

    expect(result.name).toBe("Partner Portal");
    expect(result.slug).toBe("partner-portal");
    expect(result.is_active).toBe(true);
    expect(result.course_ids).toEqual([]);
    expect(mockDB.create).toHaveBeenCalledWith(
      "content_library",
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        content_type: "portal_config",
      })
    );
  });

  it("should use provided slug", async () => {
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    const result = await createExternalPortal(1, {
      name: "Partner Portal",
      slug: "custom-slug",
    });

    expect(result.slug).toBe("custom-slug");
  });

  it("should throw BadRequestError when name is missing", async () => {
    await expect(
      createExternalPortal(1, { name: "" })
    ).rejects.toThrow("Portal name is required");
  });

  it("should throw BadRequestError on duplicate slug", async () => {
    mockDB.raw.mockResolvedValueOnce([{ id: "existing-portal" }]);

    await expect(
      createExternalPortal(1, { name: "Partner Portal" })
    ).rejects.toThrow("already exists");
  });

  it("should store branding and allowed_domains", async () => {
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    const result = await createExternalPortal(1, {
      name: "Branded Portal",
      branding: { logo: "logo.png", color: "#ff0000" },
      allowed_domains: ["partner.com", "client.com"],
      course_ids: ["c1", "c2"],
    });

    expect(result.branding).toEqual({ logo: "logo.png", color: "#ff0000" });
    expect(result.allowed_domains).toEqual(["partner.com", "client.com"]);
    expect(result.course_ids).toEqual(["c1", "c2"]);
  });
});

// -- inviteExternalUser --------------------------------------------------------

describe("inviteExternalUser", () => {
  it("should invite an external user successfully", async () => {
    // getPortalRecord: findOne returns the portal
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({
        id: "portal-1",
        org_id: 1,
        name: "Portal",
        slug: "portal",
      }),
    });
    mockDB.raw.mockResolvedValueOnce([]); // no existing invite
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    const result = await inviteExternalUser(1, "portal-1", "user@partner.com", "John Doe");

    expect(result.email).toBe("user@partner.com");
    expect(result.name).toBe("John Doe");
    expect(result.status).toBe("pending");
    expect(result.role).toBe("external_learner");
    expect(mockDB.create).toHaveBeenCalledWith(
      "content_library",
      expect.objectContaining({
        content_type: "external_invitation",
        external_id: "user@partner.com",
      })
    );
  });

  it("should throw NotFoundError when portal does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(
      inviteExternalUser(1, "nonexistent", "user@test.com", "Test")
    ).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when email is empty", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({ id: "portal-1", org_id: 1 }),
    });

    await expect(
      inviteExternalUser(1, "portal-1", "", "Test")
    ).rejects.toThrow("Email is required");
  });

  it("should throw BadRequestError when name is empty", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({ id: "portal-1", org_id: 1 }),
    });

    await expect(
      inviteExternalUser(1, "portal-1", "user@test.com", "")
    ).rejects.toThrow("Name is required");
  });

  it("should throw BadRequestError when user already invited", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({ id: "portal-1", org_id: 1 }),
    });
    mockDB.raw.mockResolvedValueOnce([{ id: "existing-invite" }]);

    await expect(
      inviteExternalUser(1, "portal-1", "user@test.com", "Test")
    ).rejects.toThrow("already been invited");
  });
});

// -- getExternalUsers ----------------------------------------------------------

describe("getExternalUsers", () => {
  it("should return all external users for an org", async () => {
    mockDB.raw.mockResolvedValueOnce([
      { metadata: JSON.stringify({ id: "inv-1", email: "a@test.com", name: "A" }) },
      { metadata: JSON.stringify({ id: "inv-2", email: "b@test.com", name: "B" }) },
    ]);

    const result = await getExternalUsers(1);

    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("a@test.com");
    expect(result[1].email).toBe("b@test.com");
  });

  it("should return empty array when no external users", async () => {
    mockDB.raw.mockResolvedValueOnce([]);

    const result = await getExternalUsers(1);

    expect(result).toEqual([]);
  });

  it("should filter out corrupted metadata records", async () => {
    mockDB.raw.mockResolvedValueOnce([
      { metadata: JSON.stringify({ id: "inv-1", email: "a@test.com" }) },
      { metadata: "invalid-json{{{" },
    ]);

    const result = await getExternalUsers(1);

    // The corrupted record returns null from parse and gets filtered
    expect(result).toHaveLength(1);
  });
});

// -- assignCoursesToPortal -----------------------------------------------------

describe("assignCoursesToPortal", () => {
  it("should assign courses to portal", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({
        id: "portal-1",
        metadata: JSON.stringify({
          id: "portal-1",
          org_id: 1,
          course_ids: [],
        }),
      })
      .mockResolvedValueOnce({ id: "c1", organization_id: 1 }) // course exists
      .mockResolvedValueOnce({ id: "c2", organization_id: 1 }); // course exists
    mockDB.update.mockResolvedValue({});

    const result = await assignCoursesToPortal(1, "portal-1", ["c1", "c2"]);

    expect(result.course_ids).toContain("c1");
    expect(result.course_ids).toContain("c2");
    expect(mockDB.update).toHaveBeenCalledWith(
      "content_library",
      "portal-1",
      expect.objectContaining({
        metadata: expect.any(String),
      })
    );
  });

  it("should throw NotFoundError when portal does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(
      assignCoursesToPortal(1, "nonexistent", ["c1"])
    ).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when a course does not exist", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({
        id: "portal-1",
        metadata: JSON.stringify({
          id: "portal-1",
          org_id: 1,
          course_ids: [],
        }),
      })
      .mockResolvedValueOnce(null); // course not found

    await expect(
      assignCoursesToPortal(1, "portal-1", ["bad-course"])
    ).rejects.toThrow("not found");
  });

  it("should deduplicate course IDs with existing ones", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({
        id: "portal-1",
        metadata: JSON.stringify({
          id: "portal-1",
          org_id: 1,
          course_ids: ["c1"],
        }),
      })
      .mockResolvedValueOnce({ id: "c1", organization_id: 1 });
    mockDB.update.mockResolvedValue({});

    const result = await assignCoursesToPortal(1, "portal-1", ["c1"]);

    expect(result.course_ids).toEqual(["c1"]);
  });
});

// -- getPortalCourses ----------------------------------------------------------

describe("getPortalCourses", () => {
  it("should return courses assigned to portal", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({
        id: "portal-1",
        org_id: 1,
        course_ids: ["c1", "c2"],
      }),
    });
    mockDB.raw.mockResolvedValueOnce([
      { id: "c1", title: "Course 1" },
      { id: "c2", title: "Course 2" },
    ]);

    const result = await getPortalCourses(1, "portal-1");

    expect(result).toHaveLength(2);
  });

  it("should return empty array when portal has no courses", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "portal-1",
      metadata: JSON.stringify({
        id: "portal-1",
        org_id: 1,
        course_ids: [],
      }),
    });

    const result = await getPortalCourses(1, "portal-1");

    expect(result).toEqual([]);
  });

  it("should throw NotFoundError when portal does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getPortalCourses(1, "nonexistent")).rejects.toThrow("not found");
  });
});
