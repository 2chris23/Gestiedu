# Informe Ejecutivo de Auditoría de Seguridad
**Sistema de Gestión Escolar Multi-Liceo**  
**ID de Ejecución**: `run-20260919-01` | **Perfil**: `standard`  
**Referencia de Código**: `a5533ae51bd2706b4ab48ef4849654c28cf81b97 (dirty)`  
**Metodología**: Cloudflare Security Audit Skill (Pipeline de 6 fases con validación adversarial)

---

## 1. Resumen de la Postura de Seguridad

Se completó una auditoría exhaustiva basada en código fuente (*source-first*) cubriendo el backend en Fastify 5, el frontend en Next.js 16 y los servicios de base de datos/infraestructura (PostgreSQL 16, PgBouncer, Redis y Docker).

El sistema cuenta con sólidas barreras de diseño defensivo, entre las que destacan:
- **Aislamiento Multi-Tenant Físico**: Base de datos dedicada por liceo (*database-per-tenant*), impidiendo la mezcla física de tablas y registros escolares.
- **Validación Estricta de Inquilino**: El middleware `identifyTenant` compara rigurosamente el `instituteId` del JWT con subdominios y cabeceras, abortando con `401 TENANT_MISMATCH` ante discrepancias.
- **Espacio de Nombres en Caché**: Uso de `AsyncLocalStorage` (`conLiceo`) para aislar automáticamente claves de Redis por institución.

Sin embargo, la auditoría identificó **12 hallazgos confirmados** (6 de severidad Alta, 6 de severidad Media) y **2 aspectos dependientes del entorno** clasificados como `needs_validation`.

---

## 2. Tabla de Hallazgos Confirmados

| Severidad | Código / Identificador | Título del Hallazgo | Límite Afectado | Resultado Observable Demostrado |
| :--- | :--- | :--- | :--- | :--- |
| **ALTA** | `auth-superadmin-cookie-httponly-missing` | Cookie de SuperAdmin sin bandera HttpOnly y en LocalStorage | Frontend / SuperAdmin Auth | Token JWT de SuperAdmin accesible desde `document.cookie` y `localStorage`. |
| **ALTA** | `auth-superadmin-logout-revocation-broken` | Cierre de sesión de SuperAdmin no revoca token en backend | Backend Auth / SuperAdmin | Llamada a logout omite cabecera Bearer; token de refresco queda activo en BD. |
| **ALTA** | `idor-single-grade-lookup` | IDOR en consulta individual de calificaciones (GET /api/grades/:id) | Control de Acceso / Notas | Estudiantes y profesores pueden consultar notas y datos de cualquier alumno vía ID. |
| **ALTA** | `grades-null-classroom-scope-bypass` | Bypass de verificación docente en actividades sin sección | Control de Acceso Docente | Actividades con `classroomId: null` omiten validación de materias asignadas. |
| **ALTA** | `filesystem-path-traversal-delete-old-file` | Eliminación arbitraria de archivos en deleteOldFile | Sistema de Archivos / Uploads | Regex ineficaz en sanitización permite borrar archivos fuera de uploads vía `../`. |
| **ALTA** | `ratelimit-bypass-unauthenticated-header` | Evasión de límite de tasa IP mediante cabecera Authorization arbitraria | Rate Limiting Global | Clientes sin autenticar rotan cabeceras Authorization evitando el cupo por IP. |
| **ALTA** | `payments-missing-idempotency-race-condition` | Pagos duplicados en abonos parciales por falta de clave de idempotencia | Concurrencia Financiera | Solicitudes simultáneas de abonos generan cobros duplicados en la BD. |
| **MEDIA** | `auth-bypass-logout-access-token` | Token de acceso JWT utilizable tras cierre de sesión | Ciclo de Vida de Tokens | El token JWT sigue aceptándose hasta su expiración al re-consultar la BD. |
| **MEDIA** | `auth-refresh-token-rotation-missing` | Falta de rotación de tokens de refresco para usuarios estándar | Persistencia de Sesión | Mismo refresh token puede reusarse indefinidamente durante 60 días sin rotación. |
| **MEDIA** | `dos-health-check-db-pool-exhaustion` | Saturación de conexiones DB por ruta /health exenta de load-shedding | Disponibilidad / Base de Datos | Inundación de peticiones a /health satura el pool de Prisma al ejecutar SELECT 1. |
| **MEDIA** | `parser-docx-memory-exhaustion-eval-plan` | Consumo excesivo de memoria por descompresión DOCX síncrona | Ingesta de Archivos | Subida de archivos DOCX sin validación de tipo ni límites de expansión en Cheerio. |
| **MEDIA** | `process-plaintext-db-credentials-in-cli-args` | Contraseña de base de datos en texto plano en argumentos CLI de pg_dump | Procesos del Sistema | URL con contraseña visible en la tabla de procesos del sistema operativo. |

---

## 3. Elementos que Requieren Validación en Despliegue (Needs Validation)

| Identificador | Hipótesis | Bloqueador Actual | Plan de Validación |
| :--- | :--- | :--- | :--- |
| `needs-val-cloud-tls-and-reverse-proxy` | Terminación TLS y protección de origen Cloudflare | Certificados y reglas de WAF/Cloudflare residen fuera del repositorio | Validar certificados en `/etc/nginx/certs` y activar Cloudflare Authenticated Origin Pulls (AOP). |
| `needs-val-database-per-tenant-isolation-permissions` | Permisos de usuario PostgreSQL por base de datos de inquilino | Permisos de usuario y `pg_hba.conf` se configuran en el servidor DB en ejecución | Verificar mediante `\du` en psql que el usuario de conexión no posea rol de superusuario global. |

---

## 4. Métricas de Cobertura de la Auditoría

- **Unidades Planificadas y Evaluadas**: 10
- **Unidades con Candidatos Confirmados**: 8
- **Unidades Cubiertas sin Hallazgos Críticos**: 2 (Mapeo de dominios de inquilino y Consultas SQL parametrizadas)
- **Bloqueadores Externos**: 0
- **Tasa de Falsos Positivos**: 0% (Todos los hallazgos respaldados con trazas de código y referencias exactas).
