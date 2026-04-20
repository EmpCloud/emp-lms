import { getKnex, KnexAdapter } from "./adapters/knex.adapter";
import { initEmpCloudDB, getEmpCloudDB, closeEmpCloudDB } from "./empcloud";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";

type SeedItem = {
  title: string;
  description: string;
  content_type: string;
  content_url: string;
  thumbnail_url: string | null;
  category: string;
  tags: string[];
  is_public: boolean;
  source: string;
};

// Varied, realistic catalog shared across orgs (idempotent by (org_id, title)).
const CATALOG: SeedItem[] = [
  {
    title: "JavaScript Cheat Sheet",
    description: "Quick reference for JavaScript syntax, common patterns, and ES2023 features.",
    content_type: "document",
    content_url: "https://www.w3schools.com/js/default.asp",
    thumbnail_url: "https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=400",
    category: "Web Development",
    tags: ["javascript", "reference", "cheatsheet"],
    is_public: true,
    source: "internal",
  },
  {
    title: "Workplace Harassment Prevention",
    description: "SCORM course covering identification, prevention, and reporting of workplace harassment.",
    content_type: "scorm",
    content_url: "https://example.com/scorm/harassment-prevention.zip",
    thumbnail_url: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400",
    category: "Compliance",
    tags: ["compliance", "hr", "mandatory"],
    is_public: true,
    source: "OpenSesame",
  },
  {
    title: "Introduction to TypeScript",
    description: "Learn the fundamentals of TypeScript: types, interfaces, generics, and more.",
    content_type: "video",
    content_url: "https://www.youtube.com/watch?v=BwuLxPH8IDs",
    thumbnail_url: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=400",
    category: "Web Development",
    tags: ["typescript", "beginner", "programming"],
    is_public: true,
    source: "YouTube",
  },
  {
    title: "Data Privacy Fundamentals (GDPR)",
    description: "Essential training on GDPR principles, lawful bases, and data subject rights.",
    content_type: "slide",
    content_url: "https://example.com/slides/gdpr-fundamentals.pdf",
    thumbnail_url: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400",
    category: "Compliance",
    tags: ["gdpr", "privacy", "compliance"],
    is_public: true,
    source: "internal",
  },
  {
    title: "Effective Communication at Work",
    description: "Build stronger team relationships through active listening and clear messaging.",
    content_type: "video",
    content_url: "https://www.ted.com/talks/julian_treasure_how_to_speak_so_that_people_want_to_listen",
    thumbnail_url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=400",
    category: "Soft Skills",
    tags: ["communication", "leadership", "collaboration"],
    is_public: true,
    source: "TED",
  },
  {
    title: "Cybersecurity Awareness for Employees",
    description: "Recognize phishing, use strong passwords, and protect company data day-to-day.",
    content_type: "scorm",
    content_url: "https://example.com/scorm/cybersec-awareness.zip",
    thumbnail_url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400",
    category: "Security",
    tags: ["security", "phishing", "mandatory"],
    is_public: true,
    source: "KnowBe4",
  },
  {
    title: "Agile & Scrum Essentials",
    description: "An interactive overview of Scrum ceremonies, roles, and artifacts.",
    content_type: "embed",
    content_url: "https://www.scrum.org/resources/what-is-scrum",
    thumbnail_url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400",
    category: "Project Management",
    tags: ["agile", "scrum", "process"],
    is_public: true,
    source: "Scrum.org",
  },
  {
    title: "Design Thinking Workshop",
    description: "Hands-on introduction to empathy mapping, ideation, and rapid prototyping.",
    content_type: "video",
    content_url: "https://www.youtube.com/watch?v=a7sEoEvT8l8",
    thumbnail_url: "https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=400",
    category: "Soft Skills",
    tags: ["design", "innovation", "creativity"],
    is_public: true,
    source: "IDEO",
  },
  {
    title: "Financial Literacy Basics",
    description: "Understand budgeting, savings, investing, and retirement fundamentals.",
    content_type: "text",
    content_url: "https://www.investopedia.com/terms/f/financial-literacy.asp",
    thumbnail_url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400",
    category: "Personal Development",
    tags: ["finance", "investing", "life-skills"],
    is_public: true,
    source: "Investopedia",
  },
  {
    title: "Diversity, Equity & Inclusion",
    description: "Build an inclusive workplace: recognize bias, foster belonging, act as an ally.",
    content_type: "scorm",
    content_url: "https://example.com/scorm/dei.zip",
    thumbnail_url: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=400",
    category: "HR",
    tags: ["dei", "inclusion", "hr"],
    is_public: true,
    source: "LinkedIn Learning",
  },
  {
    title: "Excel Advanced Formulas",
    description: "INDEX/MATCH, XLOOKUP, dynamic arrays, and pivot tables — go beyond VLOOKUP.",
    content_type: "video",
    content_url: "https://www.youtube.com/watch?v=0nbkaYsR94c",
    thumbnail_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400",
    category: "Productivity",
    tags: ["excel", "data", "productivity"],
    is_public: true,
    source: "YouTube",
  },
  {
    title: "Leading Remote Teams",
    description: "Strategies for engagement, async collaboration, and trust in distributed teams.",
    content_type: "document",
    content_url: "https://hbr.org/2020/03/a-guide-to-managing-your-newly-remote-workers",
    thumbnail_url: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400",
    category: "Leadership",
    tags: ["leadership", "remote", "management"],
    is_public: true,
    source: "HBR",
  },
];

async function seedMarketplace() {
  const adapter = new KnexAdapter({
    client: "mysql2",
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    pool: { min: config.db.poolMin, max: config.db.poolMax },
  });
  await adapter.connect();
  await initEmpCloudDB();

  const lmsDb = getKnex();
  const empDb = getEmpCloudDB();

  try {
    const orgs: Array<{ id: number; name: string }> = await empDb("organizations")
      .select("id", "name")
      .where("is_active", 1);

    if (!orgs.length) {
      console.log("No active organizations found in EmpCloud DB.");
      return;
    }

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const org of orgs) {
      // Resolve an owner user (first active admin-ish user, else any active user)
      const owner: { id: number } | undefined = await empDb("users")
        .select("id")
        .where({ organization_id: org.id, status: 1 })
        .orderBy("id", "asc")
        .first();

      if (!owner) {
        console.log(`Org #${org.id} "${org.name}": no active users, skipping`);
        continue;
      }

      for (const item of CATALOG) {
        const existing = await lmsDb("content_library")
          .where({ org_id: org.id, title: item.title })
          .first();

        if (existing) {
          totalSkipped++;
          continue;
        }

        await lmsDb("content_library").insert({
          id: uuidv4(),
          org_id: org.id,
          title: item.title,
          description: item.description,
          content_type: item.content_type,
          content_url: item.content_url,
          thumbnail_url: item.thumbnail_url,
          category: item.category,
          tags: JSON.stringify(item.tags),
          is_public: item.is_public,
          source: item.source,
          external_id: null,
          metadata: null,
          created_by: owner.id,
        });
        totalInserted++;
      }

      console.log(`Org #${org.id} "${org.name}": catalog ready (${CATALOG.length} total items)`);
    }

    console.log(`\nDone. Inserted: ${totalInserted}, Skipped (already present): ${totalSkipped}`);
  } finally {
    await lmsDb.destroy();
    await closeEmpCloudDB();
  }
}

seedMarketplace().catch((err) => {
  console.error("Marketplace seed failed:", err);
  process.exit(1);
});
