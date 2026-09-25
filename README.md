<div align="center">

# 🎓 GestiEdu — Sistema de Gestión Escolar

**Plataforma SaaS multi-tenant de gestión académica para instituciones educativas**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-blue)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)

[Características](#-características) •
[Arquitectura](#-arquitectura) •
[Instalación](#-instalación) •
[Uso](#-uso) •
[API](#-api)

</div>

---

## 🏗️ Arquitectura

GestiEdu es una plataforma **multi-tenant con base de datos por tenant (Database-per-Tenant)**. Esto significa que cada institución educativa tiene su propia base de datos PostgreSQL aislada, garantizando total privacidad y escalabilidad de datos.

```
┌─────────────────────────────────────────────────────────┐
│                    PLATAFORMA GESTIEDU                  │
│                                                         │
│   ┌─────────────┐      ┌────────────────────────────┐  │
│   │ Platform DB │      │        Tenant DBs           │  │
│   │─────────────│      │────────────────────────────│  │
│   │ SuperAdmin  │      │ tenant_instituto_a (PG)     │  │
│   │ Institutes  │ ───► │ tenant_instituto_b (PG)     │  │
│   │ WebhookLogs │      │ tenant_instituto_testing    │  │
│   └─────────────┘      └────────────────────────────┘  │
│   (gestion_escolar_platform)                            │
└─────────────────────────────────────────────────────────┘
```

- **`gestion_escolar_platform`**: Base de datos central. Almacena metadatos de institutos, SuperAdmins, configuración de platform y webhooks.
- **`tenant_<slug>`**: Base de datos privada por institución. Almacena todos los datos académicos: usuarios, aulas, ciclos, calificaciones, asistencia, horarios, materias, planes de evaluación, etc.

---

## ✨ Características

### 🏫 Multi-tenant SaaS
- **Base de datos aislada por institución** — sin mezcla de datos entre institutos
- **Resolución de tenant por cabecera HTTP** (`X-Institute-Slug`) o por subdominio
- **Provisioning automático** de nuevas bases de datos PostgreSQL al registrar un instituto
- **SuperAdmin panel** en `/superadmin` para gestionar todos los institutos de la plataforma
- **Planes y límites**: BASIC / PREMIUM / ENTERPRISE con límites de estudiantes, profesores y almacenamiento

### 👥 Gestión de Usuarios y Roles
- **Roles**: Administrador, Profesor, Estudiante, Tutor/Representante
- Autenticación JWT con refresh tokens
- Perfiles con avatares y datos de contacto
- Control de acceso basado en rol (RBAC)

### 📚 Gestión Académica Completa
- **Ciclos Escolares** (ej. 2026-2027): múltiples ciclos por institución con estados (Activo, Completado, Próximo)
- **Años** (1º Año – 5º Año) con **Secciones** (A, B, C…) configurables
- **Materias** asignables por sección con código de color personalizado
- **Planes de Evaluación** con actividades, ponderaciones y fechas
- **Horarios**: gestión visual por sección con bloques de clase, recreo y horas libres
- **Clase en Vivo**: módulo de sesión activa con horario en tiempo real

### 📊 Calificaciones y Evaluaciones
- Registro de calificaciones por lapso/período
- Actividades: Tareas, Exámenes, Proyectos, Participación
- Cálculo automático de promedios por materia, sección y ciclo
- Detección de riesgo académico por estudiante

### 📅 Control de Asistencia
- Registro diario: Presente, Ausente, Tardanza, Justificado
- Justificaciones con documentos adjuntos
- Historial de asistencia por estudiante y sección
- Reportes de asistencia exportables

### 🎓 Cierre y Promoción de Ciclo Escolar
- **Promoción manual o automática** de estudiantes al siguiente año/sección
- Estrategias de promoción: automática, semi-automática, por sección
- Creación automática del siguiente ciclo escolar y sus secciones si no existen
- Soporte para que un alumno salte años o permanezca en el mismo año
- Progreso visualizado en tiempo real durante el proceso de cierre

### 📈 Dashboard y Reportes
- Estadísticas en tiempo real por ciclo, año y sección
- Gráficos de ocupación, promedios globales y riesgo académico
- Reportes exportables (PDF, Excel)
- Vistas diferenciadas por rol

### ⚡ Rendimiento
- **Caché inteligente con Redis** para respuestas frecuentes (lecturas de dashboard, ciclos, materias)
- **Socket.io con Redis Adapter** para tiempo real multi-servidor
- **Compresión Brotli/Gzip** en todas las respuestas JSON
- **Rate Limiting** configurable por entorno
- Load testing con K6 (escenarios hasta 5k usuarios simultáneos)

### 🔒 Seguridad
- Helmet para cabeceras de seguridad HTTP
- Rate limiting por usuario autenticado o IP
- Middleware de tenant para prevenir acceso cruzado entre institutos
- Variables de entorno separadas por contexto (plataforma vs. tenant)

### 🔔 Notificaciones
- Sistema de notificaciones en tiempo real vía Socket.io
- Alertas de actividades próximas y recordatorios
- Notificaciones por email (Nodemailer)
- Jobs automáticos (cron) para sincronización de años académicos

---

## 🗂️ Estructura del Proyecto

```
SISTEMA-DE-GESTION-ESCOLAR/          ← Raíz del monorepo (Turborepo)
├── apps/
│   ├── backend/                     ← API REST (Fastify 5 + TypeScript)
│   │   └── src/
│   │       ├── config/              ← Configuración de entorno, JWT, Redis
│   │       ├── controllers/         ← 26 controladores (students, grades, schedules…)
│   │       ├── dto/                 ← Data Transfer Objects (validación Zod)
│   │       ├── jobs/                ← Cron jobs (sincronización de ciclos)
│   │       ├── middleware/          ← Auth, Tenant, RBAC, SmartCache, RateLimit
│   │       ├── migration/           ← Scripts de migración de datos multi-tenant
│   │       ├── plugins/             ← Fastify plugins (Prisma, Socket.io, Helmet)
│   │       ├── prisma/
│   │       │   ├── schema.prisma         ← Schema del tenant (BD por instituto)
│   │       │   ├── plataforma/           ← Schema de plataforma (SuperAdmin, Institute) y SUS migraciones
│   │       │   ├── seed.ts               ← Seed general
│   │       │   └── seeds/
│   │       │       └── testing-institute.seed.ts  ← Datos de prueba completos
│   │       ├── routes/              ← Definición de rutas (25 archivos)
│   │       ├── services/            ← Lógica de negocio (23 servicios)
│   │       │   └── promotion/       ← close-cycle.service.ts, strategies.ts
│   │       ├── socket/              ← Lógica de Socket.io
│   │       ├── tests/               ← Tests unitarios y de integración (Jest)
│   │       └── utils/               ← Logger, helpers
│   │
│   ├── web/                         ← Frontend (Next.js 16 + React 19)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/          ← Páginas de login y auth
│   │       │   ├── (dashboard)/     ← Layout principal del panel
│   │       │   │   └── dashboard/
│   │       │   │       ├── academico/          ← Vista de ciclos, secciones y alumnos
│   │       │   │       ├── actividades/        ← Gestión de actividades
│   │       │   │       ├── asistencia/         ← Registro de asistencia
│   │       │   │       ├── calificaciones/     ← Calificaciones por lapso
│   │       │   │       ├── clase-en-vivo/      ← Módulo de clase activa
│   │       │   │       ├── configuracion/      ← Configuración de la institución
│   │       │   │       ├── estudiantes/        ← CRUD de estudiantes
│   │       │   │       ├── horarios/           ← Gestión de horarios
│   │       │   │       ├── materias/           ← Gestión de materias
│   │       │   │       ├── profesores/         ← Gestión de profesores
│   │       │   │       ├── reportes/           ← Reportes y exportaciones
│   │       │   │       └── usuarios/           ← Gestión de usuarios
│   │       │   ├── instituto/       ← Onboarding y registro de institutos
│   │       │   └── superadmin/      ← Panel de SuperAdmin
│   │       ├── components/          ← 14 familias de componentes React
│   │       │   ├── academic/        ← GradeAccordion, PromotionFlow…
│   │       │   ├── common/          ← Botones, tablas, spinners
│   │       │   ├── evaluation/      ← Planes de evaluación
│   │       │   ├── layout/          ← Sidebar, Navbar, Shell
│   │       │   ├── live-class/      ← Componentes de clase en vivo
│   │       │   ├── schedule/        ← Visualizador de horarios
│   │       │   └── ui/              ← Componentes base (Radix UI + shadcn)
│   │       ├── hooks/               ← Custom hooks (useStudents, useClassrooms…)
│   │       ├── providers/           ← QueryClientProvider, ThemeProvider, SocketProvider
│   │       ├── services/            ← Clientes HTTP hacia el backend
│   │       ├── store/               ← Estado global (Zustand)
│   │       └── types/               ← Tipos TypeScript compartidos
│   │
│   └── mobile/                      ← App móvil (estructura base, en desarrollo)
│       └── src/
│           ├── components/
│           ├── screens/
│           ├── navigation/
│           └── services/
│
├── packages/
│   ├── shared/                      ← Código compartido entre apps
│   └── config/                      ← Configuraciones compartidas del monorepo
│
├── docker/                          ← Dockerfiles por servicio
│   ├── backend/
│   ├── web/
│   ├── postgres/
│   ├── redis/
│   └── nginx/
│
├── load-tests/                      ← Scripts K6 de carga (hasta 5k usuarios)
├── docs/                            ← Documentación técnica
├── docker-compose.yml               ← Entorno de desarrollo completo
├── docker-compose.prod.yml          ← Entorno de producción
├── inicio.ps1                       ← Script de inicio interactivo (PowerShell)
├── inicio.bat                       ← Script de inicio (CMD)
├── turbo.json                       ← Configuración Turborepo
└── package.json                     ← Scripts raíz del monorepo
```

---

## 🛠️ Stack Tecnológico

### Frontend — `apps/web`
| Tecnología | Versión | Uso |
|---|---|---|
| **Next.js** | 16 (App Router) | Framework React SSR/SSG |
| **React** | 19 | UI library |
| **TypeScript** | 5.9 | Tipado estático |
| **TailwindCSS** | 3.4 | Estilos utilitarios |
| **Radix UI** | v1/v2 | Componentes accesibles primitivos |
| **TanStack Query** | v5 | Fetching, caching y sincronización de datos |
| **Zustand** | v4 | Estado global ligero |
| **React Hook Form** | v7 | Gestión de formularios |
| **Zod** | v3 | Validación de esquemas |
| **Recharts** | v3 | Gráficos interactivos |
| **Framer Motion** | v13 | Animaciones |
| **Socket.io Client** | v4 | Tiempo real |
| **Axios** | v1 | Cliente HTTP |
| **Lucide React** | v1 | Iconos |
| **Sonner** | v2 | Notificaciones toast |
| **date-fns** | v3 | Manipulación de fechas |
| **Playwright** | v1.62 | Tests E2E |

### Backend — `apps/backend`
| Tecnología | Versión | Uso |
|---|---|---|
| **Fastify** | 5 | Framework HTTP de alta performance |
| **TypeScript** | 5.2 | Tipado estático |
| **Prisma** | 6 | ORM y migraciones |
| **PostgreSQL** | 16 | Base de datos principal (multi-tenant) |
| **Redis** | 7 | Caché inteligente + adaptador Socket.io |
| **Socket.io** | v4 | WebSockets en tiempo real |
| **JWT** | — | Autenticación stateless |
| **Zod** | v3 | Validación de DTOs |
| **Winston** | v3 | Logging estructurado |
| **node-cron** | v4 | Jobs automáticos |
| **Nodemailer** | v9 | Envío de emails |
| **ExcelJS / PDFKit** | — | Exportación de reportes |
| **Jest** | v29 | Tests unitarios |
| **K6** | — | Load testing |

### Infraestructura
| Tecnología | Uso |
|---|---|
| **Turborepo** | Monorepo con caché de builds |
| **Docker + Docker Compose** | Contenedores para desarrollo y producción |
| **Nginx** | Reverse proxy en producción |
| **GitHub Actions** | CI/CD |

---

## 🚀 Instalación

### Requisitos Previos

- **Node.js** ≥ 18.0.0
- **npm** ≥ 10.0.0
- **PostgreSQL** 15 o 16 (corriendo localmente o en Docker)
- **Redis** 7 (corriendo localmente o en Docker)
- **Git**

### Variables de Entorno

Crea el archivo `apps/backend/.env` basándote en este esquema:

```env
# ── Base de datos de plataforma (metadatos de institutos) ──
PLATFORM_DATABASE_URL=postgresql://user:password@localhost:5432/gestion_escolar_platform

# ── Base de datos del tenant por defecto (se sobreescribe en runtime por tenant) ──
DATABASE_URL=postgresql://user:password@localhost:5432/tenant_instituto_testing

# ── Redis ──
REDIS_URL=redis://localhost:6379

# ── JWT ──
JWT_SECRET=tu_jwt_secret_muy_largo_y_seguro
JWT_REFRESH_SECRET=tu_refresh_secret_muy_largo_y_seguro
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Servidor ──
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# ── Superadmin ──
SUPERADMIN_EMAIL=admin@tuapp.com
SUPERADMIN_PASSWORD=SuperAdmin2026!
```

Crea el archivo `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Instalación Rápida

**Opción A — Script interactivo (Recomendado en Windows):**
```powershell
.\inicio.ps1
# Selecciona [2] Setup Completo
```

**Opción B — Manual:**
```bash
# 1. Clonar el repositorio
git clone https://github.com/2chris23/Gestiedu.git
cd Gestiedu/SISTEMA-DE-GESTION-ESCOLAR

# 2. Instalar dependencias
npm install

# 3. Generar clientes Prisma
cd apps/backend
npx prisma generate --schema src/prisma/schema.prisma
npx prisma generate --schema src/prisma/plataforma/schema.prisma

# 4. Crear bases de datos y aplicar migraciones
npx prisma migrate dev --schema src/prisma/schema.prisma
npm run migrate:plataforma   # la plataforma tiene sus propias migraciones

# 5. Sembrar datos de prueba
npx tsx src/prisma/seed.ts

# 6. Volver a raíz e iniciar
cd ../..
npm run dev
```

### Con Docker

```bash
# Levantar todos los servicios (Postgres, Redis, Backend, Frontend, Nginx)
docker-compose up -d

# Ver logs
docker-compose logs -f backend
```

---

## 🖥️ Uso

### Uso Diario

```powershell
# PowerShell — menú interactivo
.\inicio.ps1   # → opción [1] Inicio Rápido

# O directamente con Turborepo
npm run dev    # Levanta backend (puerto 3001) y frontend (puerto 3000) en paralelo
```

### Acceso al Sistema

| URL | Descripción |
|---|---|
| `http://localhost:3000` | Panel principal de la institución |
| `http://localhost:3001` | API REST del backend |
| `http://localhost:3001/documentation` | Swagger UI (solo en desarrollo) |
| `http://localhost:3001/health` | Health check (DB + Redis) |
| `http://localhost:3000/superadmin` | Panel de SuperAdmin de plataforma |

### Credenciales de Prueba

**Instituto Testing (tenant: `instituto-testing`)**

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | `admin@tuapp.com` | `123456` |
| Profesor | `juan.perez@institutodemo.edu` | `123456` |
| Estudiante | `carlos.rodriguez@institutodemo.edu` | `123456` |

**SuperAdmin (plataforma)**

| Email | Contraseña |
|---|---|
| `admin@tuapp.com` | `SuperAdmin2026!` |

---

## 📡 API

La API está documentada con **Swagger / OpenAPI 3** en `http://localhost:3001/documentation`.

### Endpoints Principales

```
/api/auth                    ← Login, logout, refresh token
/api/academic-years          ← Ciclos escolares
/api/classrooms              ← Secciones (aulas)
/api/students                ← Gestión de estudiantes
/api/teachers                ← Gestión de profesores
/api/subjects                ← Materias
/api/grades                  ← Calificaciones
/api/attendance              ← Asistencia
/api/activities              ← Actividades (tareas, exámenes…)
/api/evaluation-plan         ← Planes de evaluación
/api/schedules               ← Horarios
/api/class-sessions          ← Sesiones de clase
/api/reports                 ← Generación de reportes
/api/notifications           ← Notificaciones
/api/dashboard               ← Estadísticas del dashboard
/api/cycle-statistics        ← Estadísticas por ciclo
/api/institutes              ← Gestión de la institución
/api/users                   ← Gestión de usuarios

# SuperAdmin (requiere token de SuperAdmin)
/api/superadmin/auth         ← Login SuperAdmin
/api/superadmin/institutes   ← CRUD de todos los institutos
```

### Autenticación

Todas las rutas protegidas requieren:
```
Authorization: Bearer <access_token>
X-Institute-Slug: instituto-testing
```

---

## 🧪 Tests

```bash
# Tests unitarios del backend
cd apps/backend
npm test

# Tests E2E del frontend (Playwright)
cd apps/web
npm run test:e2e

# Load testing con K6 (requiere k6 instalado)
npm run test:load:basic:5k
npm run test:load:write
npm run test:load:completo
npm run test:load:stress
```

---

## 🗃️ Base de Datos

El proyecto usa **dos esquemas Prisma independientes**:

| Schema | Archivo | Base de datos |
|---|---|---|
| Plataforma | `src/prisma/plataforma/schema.prisma` | `gestion_escolar_platform` |
| Tenant | `src/prisma/schema.prisma` | `tenant_<slug>` |

```bash
# Comandos útiles de Prisma (desde apps/backend)
npx prisma studio                          # GUI de la BD del tenant
npx prisma migrate dev                     # Nueva migración del tenant
npx prisma migrate deploy                  # Aplicar migraciones en producción
npx tsx src/prisma/seeds/testing-institute.seed.ts  # Seed del instituto de testing
```

---

## 🐳 Docker

```bash
# Desarrollo
docker-compose up -d

# Producción
docker-compose -f docker-compose.prod.yml up -d

# Ver logs de un servicio
docker-compose logs -f backend

# Detener todo
docker-compose down
```

---

## 🤝 Contribuir

1. Haz fork del repositorio
2. Crea una rama: `git checkout -b feature/mi-feature`
3. Commitea tus cambios: `git commit -m 'feat: descripción'`
4. Push: `git push origin feature/mi-feature`
5. Abre un Pull Request

---

## 📄 Licencia

MIT — ver [LICENSE](./LICENSE)

---

<div align="center">

**[⬆ Volver arriba](#-gestiedu--sistema-de-gestión-escolar)**

Hecho con ❤️ para instituciones educativas • [@2chris23](https://github.com/2chris23) • [Gestiedu](https://github.com/2chris23/Gestiedu)

</div>
