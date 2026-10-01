# Architecture Summary: Sistema de Gestión Escolar Multi-Liceo
**Audit Run**: `run-20260919-01`  
**Profile**: `standard` | **Scope**: `apps/backend`, `apps/web`, `packages`, `docker`  
**Source Commit**: `a5533ae51bd2706b4ab48ef4849654c28cf81b97 (dirty)`

---

## 1. Product, Principals, and Protected Resources
- **Product**: Multi-tenant School Management SaaS ("SaaS de gestión escolar multi-liceo") designed for Venezuelan secondary schools (MPPE curriculum: 1º a 5º año, 3 lapsos, grading scale 01–20).
- **Principals**:
  1. `Guest` (Unauthenticated): Limited to health checks, public school branding (`/api/institutes/public/:slug`), and login entrypoints.
  2. `STUDENT` (Tenant): Read-only view of own enrollments, grades, schedule, and attendance.
  3. `TUTOR` (Tenant): Legal guardian with read-only visibility into represented students and payment statements.
  4. `TEACHER` (Tenant): Grades, evaluation plans, attendance, and observations restricted strictly to assigned classrooms/subjects.
  5. `ADMIN` (Tenant Director): Complete operational control over single school tenant (users, academic cycles, enrollments, fees).
  6. `SUPERADMIN` (Platform Operator): Global platform management across all schools (tenant provisioning, subscription plans, schema migrations).
- **Protected Resources**:
  - Academic transcripts and grades (`Grade`, `AcademicYear`, `ClassroomSubject`).
  - Student identity, family relationships, and medical/attendance notes (`User`, `StudentTutor`, `DailyAttendance`).
  - Financial payment records and advisory locking (`Payment`, `PaymentItem`).
  - Multi-tenant database credentials (`Institute.databaseName`, `Institute.databaseUrl`).

---

## 2. Tech Stack and Deployment Models
- **Backend API**: Fastify 5 (`apps/backend`) with TypeScript, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/multipart`, and Socket.IO.
- **Frontend / Proxy**: Next.js 16 (`apps/web`) with App Router, React 19, TailwindCSS, and custom edge routing proxy (`apps/web/src/proxy.ts`).
- **ORM & Data Stores**:
  - PostgreSQL 16: Platform DB (`gestion_escolar_platform`) and isolated Tenant DBs (`tenant_<slug>`).
  - PgBouncer: Transaction-mode connection pooler (`6432`).
  - Redis 7: Rate-limit state, Socket.IO adapter, and smart caching.
- **Deployment**: Multi-container stack (`docker-compose.prod.yml`) behind Nginx reverse proxy with TLS termination, HSTS, and rate-limiting headers.

---

## 3. Trust Boundaries and Primary Controls
1. **Network / Edge Boundary**:
   - Nginx overwrites `X-Forwarded-For` with `$remote_addr`. Fastify `deQuienNosFiamos` restricts proxy trust to loopback and RFC 1918 CIDRs.
2. **Platform vs Tenant Isolation Boundary**:
   - `identifyTenant` hook checks verified JWT claim `instituteId` against incoming host subdomains and headers. Any mismatch triggers fail-closed `401 TENANT_MISMATCH`.
   - Dynamic database resolution via `getTenantPrisma(instituteId)`.
   - Redis cache key isolation enforced via `AsyncLocalStorage` (`conLiceo`) prefixing `gestion-escolar:liceo:{instituteId}:`.
3. **Role & Resource Ownership Boundaries**:
   - Guard reordering (`ponerLosGuardiasPrimero`) forces authentication hooks to run before Fastify schema validation.
   - Fine-grained teacher/student scoping enforced by `assertClassroomScope` and `assertCanSeeStudent`.
   - Financial ledger integrity guarded by transactional advisory locks (`SELECT pg_advisory_xact_lock(...)`).

---

## 4. Companion Selection Summary
From `ATTACK-CLASSES.md`, the following companions are selected based on observed trust boundaries:
- **`WEB-PROTOCOL-AND-AUTH.md`**: Required by dual JWT systems (Tenant vs SuperAdmin), session cookie synchronization in Next.js proxy, and role boundaries.
- **`DATA-ISOLATION-AND-LIFECYCLE.md`**: Required by Database-per-Tenant architecture, Redis cache namespaces, and raw SQL queries (`$queryRawUnsafe`).
- **`RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`**: Required by bulk grading/attendance transactions, Word/document parsers (`mammoth`), and PgBouncer connection limits.
- **`CLOUD-AND-DEPLOYMENT.md`**: Required by multi-tier Docker compose, secret handling (`JWT_SECRET`, DB passwords), and Nginx reverse proxy.
- **`SUPPLY-CHAIN-AND-RELEASE.md`**: Required by monorepo dependencies, Prisma client generation, and package scripts.
