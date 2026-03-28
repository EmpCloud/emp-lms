# EMP LMS

> Full-featured Learning Management System -- courses, quizzes, learning paths, certifications, SCORM, ILT, compliance training, gamification, discussions, analytics, and ratings.

[![Part of EmpCloud](https://img.shields.io/badge/EmpCloud-Module-blue)]()
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-purple.svg)](LICENSE)
[![Tests: 657 passing](https://img.shields.io/badge/tests-657%20passing-brightgreen.svg)]()
[![Status: Built](https://img.shields.io/badge/Status-Built-green)]()

EMP LMS is the learning management module of the [EmpCloud](https://empcloud.com) HRMS ecosystem. It provides a course builder with drag-reorder modules and lessons, 7-type quiz engine with auto-grading, multi-course learning paths, certificate generation with PDF export, SCORM 1.2/2004 package support, video learning with progress tracking, instructor-led training (virtual and in-person), mandatory compliance training with due dates and overdue tracking, gamification with points/badges/leaderboards, course discussions and Q&A, ratings and reviews, AI-powered recommendations via OpenAI, a content marketplace, extended enterprise portals, and comprehensive analytics with CSV export.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Frontend Pages](#frontend-pages)
- [Testing](#testing)
- [BullMQ Scheduled Jobs](#bullmq-scheduled-jobs)
- [Integration with EmpCloud](#integration-with-empcloud)
- [Test Deployment](#test-deployment)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **Course Management** | CRUD courses with modules and lessons. Course builder with drag-reorder. Categories, tags, prerequisites. Multiple content types (video, document, SCORM, text). |
| **Quizzes** | 7 question types: multiple choice, multi-select, true/false, fill-in-the-blank, essay, matching, ordering. Auto-grading for objective types. Configurable attempts, time limits, passing score. |
| **Learning Paths** | Multi-course sequences with mandatory and optional courses. Auto progress tracking. Completion certificates. |
| **Certifications** | HTML templates with Puppeteer PDF generation. Issue, renew, and revoke certificates. Expiry alerts. Verification endpoint. |
| **SCORM / xAPI** | Upload SCORM 1.2 and 2004 packages. Iframe-based player with runtime tracking. xAPI statement support. |
| **Video Learning** | Upload and stream video content. HTML5 player with chapter markers. Progress tracking per lesson. |
| **Compliance Training** | Assign mandatory training by department, role, or individual user. Due dates, overdue tracking, reminder emails. Daily compliance check job. |
| **ILT Sessions** | Schedule virtual or in-person instructor-led training sessions. Registration, attendance tracking, capacity management. |
| **Gamification** | Points awarded per course completion, quiz pass, learning streak. Leaderboards (org-wide, department). Badge system. Integrates with EMP Rewards API. |
| **AI Recommendations** | OpenAI integration for personalized course suggestions. Role and skill-based recommendations. Trending and similar course suggestions. |
| **Discussions** | Course-level discussion forums and Q&A threads. Reply threading. |
| **Ratings & Reviews** | Star ratings and written reviews per course. Average rating calculation. One review per user per course. |
| **Content Marketplace** | Curated content library. Import external content into courses. |
| **Extended Enterprise** | External portals for customers, partners, and vendors. Invite external users and assign courses. |
| **Analytics** | Overview dashboard, course analytics, user analytics, org analytics, completion trends. CSV export. Recharts visualizations. |
| **Offline / PWA** | Service worker caches app shell and API responses. Responsive UI. PWA manifest for installable experience. |
| **Training Needs** | Links to EMP Performance skills gap API for targeted course recommendations. |
| **API Documentation** | Health check endpoint. Full route documentation. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Backend | Express 5, TypeScript 5.7 |
| Frontend | React 19, Vite 6, Tailwind CSS 3.4 |
| Database | MySQL 8 via Knex.js (`emp_lms` database) |
| Queue | BullMQ + Redis 7 |
| Auth | JWT (HS256), SSO via EmpCloud OAuth2 |
| Validation | Zod 3.24 |
| Testing | Vitest 2.1 (657 tests) |
| State | Zustand 5, TanStack React Query 5 |
| Charts | Recharts 2.14 |
| Email | Nodemailer + Handlebars templates (7 templates) |
| PDF | Puppeteer (certificate generation) |
| Monorepo | pnpm workspaces (3 packages) |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- MySQL 8+
- Redis 7+
- EMP Cloud running (for SSO authentication)

### Install & Run

```bash
# 1. Clone
git clone https://github.com/EmpCloud/emp-lms.git
cd emp-lms

# 2. Install dependencies
pnpm install

# 3. Start infrastructure
docker compose up -d   # MySQL (3306), Redis (6379), Mailpit (8025/1025)

# 4. Configure
cp .env.example .env   # Edit DB credentials, JWT secret

# 5. Run migrations & seed
pnpm run db:migrate
pnpm run db:seed

# 6. Start development
pnpm run dev           # Server on :4700, Client on :5183
```

Once running, visit:
- **Client**: http://localhost:5183
- **API**: http://localhost:4700
- **Mailpit**: http://localhost:8025

### Scripts

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

### Docker Deployment

```bash
# Build images
docker build -t emp-lms-server packages/server
docker build -t emp-lms-client packages/client

# Or use compose
docker compose up -d
```

Server: Node 20 Alpine + Chromium (for Puppeteer PDF generation), port 4700.
Client: Nginx Alpine serving Vite build, port 80 with SPA routing.

---

## Project Structure

```
emp-lms/
  packages/
    shared/              # @emp-lms/shared -- types, validators, constants
      src/
        types/           # TypeScript interfaces & enums
        validators/      # Zod schemas (shared client + server)
        constants/       # Course statuses, question types, permissions
    server/              # @emp-lms/server (port 4700)
      src/
        api/
          routes/        # 18 route modules
          middleware/     # Auth, RBAC, validation, error handling (5 middleware)
        services/        # 18 service modules
        db/
          adapters/      # Knex database adapter
          migrations/sql/ # 1 migration (comprehensive initial schema)
          seeds/         # Sample data seeder
        jobs/            # BullMQ workers (email, compliance, certs, streaks)
        events/          # Typed event emitter (17 event types)
        templates/       # 7 Handlebars email templates
        config/          # Environment configuration
        utils/           # Logger, errors, response helpers
    client/              # @emp-lms/client (port 5183)
      src/
        pages/           # 14 page modules
        components/      # DashboardLayout, VideoPlayer, CertificateDownload
        api/             # Axios client + React Query hooks
        lib/             # Auth store, utils
      public/            # PWA manifest + service worker
  docker-compose.yml     # MySQL, Redis, Mailpit
  docker/nginx.conf      # Nginx SPA config
```

---

## Database Schema

27 tables in 1 comprehensive migration:

| Category | Tables |
|----------|--------|
| **Core** | `courses`, `course_modules`, `lessons`, `course_categories`, `enrollments`, `lesson_progress` |
| **Quizzes** | `quizzes`, `questions`, `quiz_attempts`, `quiz_attempt_answers` |
| **Learning Paths** | `learning_paths`, `learning_path_courses`, `learning_path_enrollments` |
| **Certifications** | `certificates`, `certificate_templates` |
| **Compliance** | `compliance_assignments`, `compliance_records` |
| **ILT** | `ilt_sessions`, `ilt_attendance` |
| **SCORM** | `scorm_packages`, `scorm_tracking` |
| **Other** | `content_library`, `course_ratings`, `discussions`, `user_learning_profiles`, `notifications`, `audit_logs` |

---

## API Endpoints

All endpoints under `/api/v1/`. Server runs on port **4700**.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | JWT login |
| POST | `/auth/sso` | SSO token exchange with EMP Cloud |

### Courses

| Method | Path | Description |
|--------|------|-------------|
| GET | `/courses` | List/search courses (paginated, filterable) |
| POST | `/courses` | Create course (admin) |
| GET | `/courses/:id` | Course detail with modules and lessons |
| PUT | `/courses/:id` | Update course (admin) |
| DELETE | `/courses/:id` | Delete course (admin) |

### Enrollments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/enrollments` | Enroll user in course |
| POST | `/enrollments/bulk` | Bulk enroll users (admin) |
| GET | `/enrollments/my` | My enrollments with progress |
| PUT | `/enrollments/:id/progress` | Update lesson progress |

### Quizzes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/quizzes/:id` | Get quiz with questions |
| POST | `/quizzes/attempt` | Submit quiz attempt (auto-graded) |
| GET | `/quizzes/:id/attempts` | List attempts for a quiz |

### Learning Paths

| Method | Path | Description |
|--------|------|-------------|
| GET | `/learning-paths` | List learning paths |
| POST | `/learning-paths` | Create learning path (admin) |
| GET | `/learning-paths/:id` | Path detail with courses |
| POST | `/learning-paths/:id/enroll` | Enroll in learning path |

### Certifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/certificates/my` | My certificates |
| POST | `/certificates/issue` | Issue certificate (admin) |
| GET | `/certificates/:id/download` | Download certificate PDF |
| GET | `/certificates/:id/verify` | Verify certificate |

### Compliance Training

| Method | Path | Description |
|--------|------|-------------|
| GET | `/compliance/my` | My compliance assignments |
| POST | `/compliance/assign` | Assign compliance training (admin) |
| GET | `/compliance/dashboard` | Compliance overview dashboard |
| GET | `/compliance/overdue` | List overdue assignments |

### ILT Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ilt` | List ILT sessions |
| POST | `/ilt` | Create session (admin) |
| POST | `/ilt/:id/register` | Register for session |
| POST | `/ilt/:id/attendance` | Mark attendance (admin) |

### SCORM

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scorm/:id/launch` | Launch SCORM player |
| POST | `/scorm/upload` | Upload SCORM package (admin) |
| POST | `/scorm/:id/tracking` | Save SCORM runtime data |

### Gamification

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gamification/leaderboard` | Points leaderboard |
| GET | `/gamification/my` | My points and badges |
| GET | `/gamification/badges` | Available badges |

### Discussions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/discussions` | List discussions for a course (`?course_id=xxx`) |
| POST | `/discussions` | Create discussion thread |
| POST | `/discussions/:id/replies` | Reply to discussion |

### Ratings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ratings` | List ratings for a course (`?course_id=xxx`) |
| POST | `/ratings` | Submit course rating |
| PUT | `/ratings/:id` | Update own rating |

### Other Endpoints

| Area | Path | Description |
|------|------|-------------|
| Analytics | `/analytics/overview` | Analytics dashboard data |
| Analytics | `/analytics/courses` | Course-level analytics |
| Analytics | `/analytics/users` | User-level analytics |
| Recommendations | `/recommendations` | AI-powered course recommendations |
| Marketplace | `/marketplace` | Content marketplace library |
| Notifications | `/notifications` | In-app notifications |
| Video | `/video/upload` | Video upload |
| Video | `/video/:id/stream` | Video streaming |
| Health | `/health` | Health check |

---

## Frontend Pages

14 page modules across admin and learner views:

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Overview stats, enrolled courses, progress, upcoming deadlines |
| Courses | `/courses` | Course catalog with search, filters, categories |
| Course Detail | `/courses/:id` | Course content, modules, lessons, quizzes, discussions, ratings |
| Learning Paths | `/learning-paths` | Learning path catalog and enrollment |
| Quizzes | `/quizzes` | Quiz list and attempt interface |
| Certifications | `/certifications` | My certificates, download PDF, verification |
| Compliance | `/compliance` | Compliance assignments, due dates, overdue tracking |
| ILT | `/ilt` | ILT session schedule, registration, attendance |
| SCORM | `/scorm` | SCORM package player |
| Leaderboard | `/leaderboard` | Gamification leaderboard, points, badges |
| Marketplace | `/marketplace` | Content marketplace browse and import |
| Analytics | `/analytics` | Admin analytics: overview, course, user, org, trends, CSV export |
| Settings | `/settings` | Module settings, categories, certificate templates |
| Auth | `/login` | Login and SSO authentication |

---

## Testing

### Running Tests

```bash
# All tests
cd packages/server
pnpm exec vitest run              # 657 tests, 28 suites

# Coverage report
pnpm exec vitest run --coverage

# Watch mode
pnpm exec vitest --watch
```

### Test Files

| File | Description |
|------|-------------|
| `src/__tests__/api.test.ts` | API integration tests (routes, auth, CRUD) |
| `src/__tests__/validators.test.ts` | Zod validator tests |
| `src/events/index.test.ts` | Event emitter tests (17 event types) |
| `src/utils/errors.test.ts` | Error class tests |
| `src/utils/response.test.ts` | Response helper tests |

---

## BullMQ Scheduled Jobs

| Queue | Schedule | Purpose |
|-------|----------|---------|
| `lms:compliance-check` | Daily 8 AM | Mark overdue compliance records |
| `lms:certificate-expiry` | Daily 2 AM | Check expiring certificates |
| `lms:streak-update` | Daily midnight | Reset stale learning streaks |
| `lms:reminders` | Daily 9 AM | Send compliance/training reminders |
| `lms:email` | On demand | Process email queue |
| `lms:analytics` | On demand | Analytics aggregation |

---

## Integration with EmpCloud

| Integration | Description |
|-------------|-------------|
| **Auth / SSO** | SSO via EmpCloud OAuth2 (RS256 JWT exchanged for HS256 local JWT). |
| **Users** | Reads from EmpCloud master DB (`empcloud.users`, `empcloud.organizations`). |
| **Performance** | Fetches skill gaps from EMP Performance API for targeted AI recommendations. |
| **Rewards** | Awards points/badges via EMP Rewards API on course/quiz/path completion. |
| **Multi-Tenant** | All data isolated by `organization_id`. |

---

## Environment Variables

See [`.env.example`](.env.example) for all variables. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4700` | Server port |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_NAME` | `emp_lms` | Database name |
| `EMPCLOUD_DB_NAME` | `empcloud` | EmpCloud master DB (users, orgs) |
| `REDIS_HOST` | `localhost` | Redis for BullMQ |
| `JWT_SECRET` | -- | JWT signing secret |
| `SMTP_HOST` | `localhost` | Email SMTP server |
| `AI_API_KEY` | -- | OpenAI key (optional, for AI recommendations) |
| `REWARDS_API_URL` | -- | EMP Rewards API URL (optional, for gamification sync) |

---

## Test Deployment

| Environment | URL |
|-------------|-----|
| Frontend | https://testlms.empcloud.com |
| API | https://testlms-api.empcloud.com |

SSO integrated with EMP Cloud. Users can launch LMS directly from the EMP Cloud dashboard.

---

## License

This project is licensed under the [AGPL-3.0 License](LICENSE).
