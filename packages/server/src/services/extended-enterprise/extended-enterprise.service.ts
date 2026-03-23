// ============================================================================
// EXTENDED ENTERPRISE SERVICE
// Basic V2 implementation for training external users (customers, partners).
// Uses content_library metadata for portal config storage.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { logger } from "../../utils/logger";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExternalPortal {
  id: string;
  org_id: number;
  name: string;
  slug: string;
  branding: Record<string, any>;
  allowed_domains: string[];
  course_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ExternalInvitation {
  id: string;
  org_id: number;
  portal_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  invited_at: string;
}

// Portal configs stored in content_library with content_type = 'portal_config'
// and metadata JSON containing the portal data.
// External user invitations stored as content_type = 'external_invitation'.

// ---------------------------------------------------------------------------
// Create External Portal
// ---------------------------------------------------------------------------

export async function createExternalPortal(
  orgId: number,
  data: {
    name: string;
    slug?: string;
    branding?: Record<string, any>;
    allowed_domains?: string[];
    course_ids?: string[];
  }
): Promise<ExternalPortal> {
  const db = getDB();

  if (!data.name) {
    throw new BadRequestError("Portal name is required.");
  }

  const portalId = uuidv4();
  const slug =
    data.slug ||
    data.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");

  // Check slug uniqueness within org portals
  const existingPortals = await db.raw<any[]>(
    `SELECT id FROM content_library
     WHERE org_id = ? AND content_type = 'portal_config'
     AND JSON_EXTRACT(metadata, '$.slug') = ?`,
    [orgId, slug]
  );

  if (existingPortals && existingPortals.length > 0) {
    throw new BadRequestError(`A portal with slug '${slug}' already exists.`);
  }

  const portalData: ExternalPortal = {
    id: portalId,
    org_id: orgId,
    name: data.name,
    slug,
    branding: data.branding || {},
    allowed_domains: data.allowed_domains || [],
    course_ids: data.course_ids || [],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Store as content_library record with special content_type
  await db.create<any>("content_library", {
    id: portalId,
    org_id: orgId,
    title: data.name,
    description: `External training portal: ${data.name}`,
    content_type: "portal_config",
    content_url: null,
    thumbnail_url: null,
    category: "external_portal",
    tags: JSON.stringify(["external", "portal"]),
    is_public: false,
    source: "extended_enterprise",
    external_id: slug,
    metadata: JSON.stringify(portalData),
    created_by: 0,
  });

  logger.info(`External portal created: ${data.name} (${portalId}) for org ${orgId}`);

  return portalData;
}

// ---------------------------------------------------------------------------
// Get Portal
// ---------------------------------------------------------------------------

async function getPortalRecord(
  orgId: number,
  portalId: string
): Promise<ExternalPortal> {
  const db = getDB();

  const record = await db.findOne<any>("content_library", {
    id: portalId,
    org_id: orgId,
    content_type: "portal_config",
  });

  if (!record) {
    throw new NotFoundError("External Portal", portalId);
  }

  let portalData: ExternalPortal;
  try {
    portalData =
      typeof record.metadata === "string"
        ? JSON.parse(record.metadata)
        : record.metadata;
  } catch {
    throw new BadRequestError("Corrupted portal configuration.");
  }

  return portalData;
}

// ---------------------------------------------------------------------------
// Invite External User
// ---------------------------------------------------------------------------

export async function inviteExternalUser(
  orgId: number,
  portalId: string,
  email: string,
  name: string,
  role: string = "external_learner"
): Promise<ExternalInvitation> {
  const db = getDB();

  // Verify portal exists
  await getPortalRecord(orgId, portalId);

  if (!email) {
    throw new BadRequestError("Email is required.");
  }
  if (!name) {
    throw new BadRequestError("Name is required.");
  }

  // Check if already invited
  const existingInvites = await db.raw<any[]>(
    `SELECT id FROM content_library
     WHERE org_id = ? AND content_type = 'external_invitation'
     AND JSON_EXTRACT(metadata, '$.portal_id') = ?
     AND JSON_EXTRACT(metadata, '$.email') = ?`,
    [orgId, portalId, email]
  );

  if (existingInvites && existingInvites.length > 0) {
    throw new BadRequestError(`User ${email} has already been invited to this portal.`);
  }

  const invitationId = uuidv4();
  const invitation: ExternalInvitation = {
    id: invitationId,
    org_id: orgId,
    portal_id: portalId,
    email,
    name,
    role,
    status: "pending",
    invited_at: new Date().toISOString(),
  };

  await db.create<any>("content_library", {
    id: invitationId,
    org_id: orgId,
    title: `Invitation: ${name} (${email})`,
    description: `External user invitation for portal ${portalId}`,
    content_type: "external_invitation",
    content_url: null,
    thumbnail_url: null,
    category: "external_invitation",
    tags: JSON.stringify(["external", "invitation", role]),
    is_public: false,
    source: "extended_enterprise",
    external_id: email,
    metadata: JSON.stringify(invitation),
    created_by: 0,
  });

  logger.info(`External user invited: ${email} to portal ${portalId}`);

  return invitation;
}

// ---------------------------------------------------------------------------
// Get External Users
// ---------------------------------------------------------------------------

export async function getExternalUsers(
  orgId: number
): Promise<ExternalInvitation[]> {
  const db = getDB();

  const records = await db.raw<any[]>(
    `SELECT metadata FROM content_library
     WHERE org_id = ? AND content_type = 'external_invitation'
     ORDER BY created_at DESC`,
    [orgId]
  );

  const users: ExternalInvitation[] = records.map((record: any) => {
    try {
      return typeof record.metadata === "string"
        ? JSON.parse(record.metadata)
        : record.metadata;
    } catch {
      return null;
    }
  }).filter(Boolean);

  return users;
}

// ---------------------------------------------------------------------------
// Assign Courses to Portal
// ---------------------------------------------------------------------------

export async function assignCoursesToPortal(
  orgId: number,
  portalId: string,
  courseIds: string[]
): Promise<ExternalPortal> {
  const db = getDB();

  const portal = await getPortalRecord(orgId, portalId);

  if (!Array.isArray(courseIds)) {
    throw new BadRequestError("courseIds must be an array.");
  }

  // Verify courses exist
  for (const courseId of courseIds) {
    const course = await db.findOne<any>("courses", {
      id: courseId,
      organization_id: orgId,
    });
    if (!course) {
      throw new NotFoundError("Course", courseId);
    }
  }

  // Merge with existing, deduplicate
  const existingIds = new Set(portal.course_ids || []);
  for (const id of courseIds) {
    existingIds.add(id);
  }

  portal.course_ids = Array.from(existingIds);
  portal.updated_at = new Date().toISOString();

  // Update the record
  await db.update("content_library", portalId, {
    metadata: JSON.stringify(portal),
  });

  logger.info(`Courses assigned to portal ${portalId}: ${courseIds.join(", ")}`);

  return portal;
}

// ---------------------------------------------------------------------------
// Get Portal Courses
// ---------------------------------------------------------------------------

export async function getPortalCourses(
  orgId: number,
  portalId: string
): Promise<any[]> {
  const db = getDB();

  const portal = await getPortalRecord(orgId, portalId);

  if (!portal.course_ids || portal.course_ids.length === 0) {
    return [];
  }

  const placeholders = portal.course_ids.map(() => "?").join(",");

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.id IN (${placeholders}) AND c.organization_id = ? AND c.status = 'published'
     ORDER BY c.title`,
    [...portal.course_ids, orgId]
  );

  return courses;
}
