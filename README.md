# emp-lms — EmpCloud Learning Management System

> Full-featured LMS module for the EmpCloud HRMS platform. Courses, learning paths, SCORM, quizzes, certifications, compliance training, ILT, gamification, AI recommendations, and more.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+ |
| **Backend** | Express 5, TypeScript 5.7 |
| **Frontend** | React 19, Vite 6, Tailwind CSS 3.4 |
| **Database** | MySQL 8 (Knex query builder) |
| **Queue** | BullMQ + Redis 7 |
| **Auth** | JWT (HS256), SSO via EmpCloud OAuth2 |
| **Validation** | Zod 3.24 |
| **Testing** | Vitest 2.1 (657 tests) |
| **State** | Zustand 5, TanStack React Query 5 |
| **Charts** | Recharts 2.14 |
| **Email** | Nodemailer + Handlebars templates |
| **PDF** | Puppeteer (certificate generation) |
| **Package Manager** | pnpm (workspaces) |

## Architecture

```
emp-lms/
├── packages/
│   ├── server/          # Express API (port 4700)
│   │   ├── src/
│   │   │   ├── api/     # 18 route files, 5 middleware
│   │   │   ├── services/  # 21 service modules
│   │   │   ├── db/      # Knex adapter, migrations, seeds
│   │   │   ├── jobs/    # BullMQ workers (email, compliance, certs, streaks)
│   │   │   ├── events/  # Typed event emitter (17 event types)
│   │   │   └── templates/  # 7 Handlebars email templates
│   │   ├── Dockerfile
│   │   └── vitest.config.ts
│   ├── client/          # React SPA (port 5183)
│   │   ├── src/
│   │   │   ├── pages/      # 22 page components
│   │   │   ├── components/ # DashboardLayout, VideoPlayer, CertificateDownload
│   │   │   ├── api/        # Axios client + React Query hooks
│   │   │   └── lib/        # Auth store, utils
│   │   ├── public/      # PWA manifest + service worker
│   │   └── Dockerfile
│   └── shared/          # Types, validators, constants (Zod)
├── docker-compose.yml   # MySQL, Redis, Mailpit
└── docker/nginx.conf    # Nginx SPA config
```

## Features (15/15 complete)

| Feature | Description |
|---------|-------------|
| **Course Management** | CRUD courses, modules, lessons. Course builder with drag reorder. Categories, tags, prerequisites. |
| **Learning Paths** | Multi-course sequences. Mandatory/optional courses. Auto progress tracking. |
| **SCORM/xAPI** | Upload SCORM 1.2/2004 packages. Iframe player with tracking. xAPI support. |
| **Video Learning** | Upload/stream video. HTML5 player with chapter markers. Progress tracking. |
| **Quizzes** | 7 question types (MCQ, multi-select, true/false, fill-blank, essay, matching, ordering). Auto-grading, attempts, timer. |
| **Certifications** | HTML templates, PDF generation (Puppeteer), issue/renew/revoke, expiry alerts, verification. |
| **Compliance** | Assign mandatory training by dept/role/user. Due dates, overdue tracking, reminder emails. |
| **ILT** | Schedule sessions (virtual/in-person), register, attendance tracking, capacity management. |
| **Gamification** | Points per completion/quiz/streak. Leaderboards. Badge system. Integrates with emp-rewards API. |
| **AI Recommendations** | OpenAI integration. Role/skill-based suggestions. Trending courses. Similar courses. |
| **Marketplace** | Curated content library. Import external content into courses. |
| **Offline/PWA** | Service worker caches app shell + API responses. Responsive UI. PWA manifest. |
| **Training Needs** | Links to emp-performance skills gap API for targeted recommendations. |
| **Analytics** | Overview dashboard, course/user/org analytics, completion trends, CSV export. Recharts charts. |
| **Extended Enterprise** | External portals for customers/partners/vendors. Invite users, assign courses. |

## API Routes (18 endpoints)

```
POST   /api/v1/auth/login          # JWT login
POST   /api/v1/auth/sso            # SSO token exchange
GET    /api/v1/courses              # List/search courses
POST   /api/v1/courses              # Create course (admin)
GET    /api/v1/courses/:id          # Course detail with modules/lessons
POST   /api/v1/enrollments          # Enroll user
POST   /api/v1/enrollments/bulk     # Bulk enroll (admin)
GET    /api/v1/enrollments/my       # My enrollments with progress
GET    /api/v1/quizzes/:id          # Quiz with questions
POST   /api/v1/quizzes/attempt      # Submit quiz attempt
GET    /api/v1/learning-paths       # Learning paths
GET    /api/v1/certificates/my      # My certificates
GET    /api/v1/compliance/my        # My compliance assignments
GET    /api/v1/ilt                  # ILT sessions
GET    /api/v1/analytics/overview   # Analytics dashboard
GET    /api/v1/gamification/leaderboard
GET    /api/v1/notifications        # In-app notifications
GET    /api/v1/discussions          # Course discussions
GET    /api/v1/ratings              # Course ratings
GET    /api/v1/marketplace          # Content marketplace
GET    /api/v1/recommendations      # AI recommendations
GET    /api/v1/scorm/:id/launch     # SCORM player launch
```

## Database (27 tables)

Core: `courses`, `course_modules`, `lessons`, `course_categories`, `enrollments`, `lesson_progress`

Quizzes: `quizzes`, `questions`, `quiz_attempts`, `quiz_attempt_answers`

Paths: `learning_paths`, `learning_path_courses`, `learning_path_enrollments`

Certs: `certificates`, `certificate_templates`

Compliance: `compliance_assignments`, `compliance_records`

ILT: `ilt_sessions`, `ilt_attendance`

SCORM: `scorm_packages`, `scorm_tracking`

Other: `content_library`, `course_ratings`, `discussions`, `user_learning_profiles`, `notifications`, `audit_logs`

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm, MySQL, Redis

# 1. Clone
git clone git@github.com:EmpCloud/emp-lms.git
cd emp-lms

# 2. Install
pnpm install

# 3. Start infrastructure
docker compose up -d   # MySQL (3306), Redis (6379), Mailpit (8025/1025)

# 4. Configure
cp .env.example .env   # Edit DB credentials, JWT secret

# 5. Run
pnpm run dev           # Server on :4700, Client on :5183
```

## Scripts

```bash
pnpm run dev           # Start server + client concurrently
pnpm run dev:server    # Server only (tsx watch)
pnpm run dev:client    # Client only (vite dev)
pnpm run build         # Build all packages
pnpm run test          # Run all tests (657 passing)
pnpm run db:migrate    # Run database migrations
pnpm run db:seed       # Load sample data
pnpm run db:rollback   # Rollback last migration
pnpm run docker:up     # Start Docker services
pnpm run docker:down   # Stop Docker services
```

## Testing

```bash
cd packages/server
pnpm exec vitest run              # 657 tests, 28 suites
pnpm exec vitest run --coverage   # Coverage report
pnpm exec vitest --watch          # Watch mode
```

## Environment Variables

See [`.env.example`](.env.example) for all variables. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4700 | Server port |
| `DB_HOST` | localhost | MySQL host |
| `DB_NAME` | emp_lms | Database name |
| `EMPCLOUD_DB_NAME` | empcloud | EmpCloud master DB (users, orgs) |
| `REDIS_HOST` | localhost | Redis for BullMQ |
| `JWT_SECRET` | - | JWT signing secret |
| `SMTP_HOST` | localhost | Email SMTP |
| `AI_API_KEY` | - | OpenAI key (optional, for recommendations) |
| `REWARDS_API_URL` | - | emp-rewards API URL (optional, for gamification) |

## Integration with EmpCloud

- **Auth**: SSO via EmpCloud OAuth2 (RS256 JWT → HS256 local JWT)
- **Users**: Reads from EmpCloud master DB (`empcloud.users`, `empcloud.organizations`)
- **Performance**: Fetches skill gaps from emp-performance API for AI recommendations
- **Rewards**: Awards points/badges via emp-rewards API on course/quiz/path completion
- **Multi-tenant**: All data isolated by `organization_id`

## Docker Deployment

```bash
# Build images
docker build -t emp-lms-server packages/server
docker build -t emp-lms-client packages/client

# Or use compose
docker compose up -d
```

Server: Node 20 Alpine + Chromium (for Puppeteer PDF generation), port 4700
Client: Nginx Alpine serving Vite build, port 80 with SPA routing

## BullMQ Scheduled Jobs

| Queue | Schedule | Purpose |
|-------|----------|---------|
| `lms:compliance-check` | Daily 8 AM | Mark overdue compliance records |
| `lms:certificate-expiry` | Daily 2 AM | Check expiring certificates |
| `lms:streak-update` | Daily midnight | Reset stale learning streaks |
| `lms:reminders` | Daily 9 AM | Send compliance/training reminders |
| `lms:email` | On demand | Process email queue |
| `lms:analytics` | On demand | Analytics aggregation |
