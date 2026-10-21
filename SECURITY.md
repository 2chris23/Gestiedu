# Política de Seguridad

## Versiones Soportadas

Actualmente damos soporte de seguridad a las siguientes versiones:

| Versión | Soportada          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reportar una Vulnerabilidad

La seguridad de nuestro sistema es una prioridad. Si descubres una vulnerabilidad de seguridad, por favor repórtala de manera responsable.

### Cómo Reportar

**NO** abras un issue público para vulnerabilidades de seguridad.

En su lugar, envía un email a:
- **Email**: security@institutodemo.edu (o crea un Security Advisory en GitHub)

### Información a Incluir

Por favor incluye la siguiente información en tu reporte:

- Descripción detallada de la vulnerabilidad
- Pasos para reproducir el problema
- Versión afectada del software
- Impacto potencial
- Sugerencias de mitigación (si las tienes)

### Qué Esperar

1. **Confirmación**: Recibirás una confirmación de recepción en 48 horas
2. **Evaluación**: Evaluaremos la vulnerabilidad en 7 días
3. **Actualización**: Te mantendremos informado del progreso
4. **Resolución**: Trabajaremos en un fix y lo lanzaremos lo antes posible
5. **Crédito**: Te daremos crédito por el descubrimiento (si lo deseas)

## Mejores Prácticas de Seguridad

### Para Desarrolladores

- **Nunca** commits credenciales o secrets al repositorio
- Usa variables de entorno para información sensible
- Mantén las dependencias actualizadas
- Revisa el código antes de hacer merge
- Usa HTTPS para todas las comunicaciones

### Para Usuarios

- Cambia las credenciales por defecto inmediatamente
- Usa contraseñas fuertes y únicas
- Mantén el sistema actualizado
- Habilita autenticación de dos factores (cuando esté disponible)
- Reporta actividad sospechosa

## Configuración de Seguridad Recomendada

### Variables de Entorno

```bash
# Cambia estos valores en producción
JWT_SECRET="tu-secreto-super-seguro-y-largo"
DATABASE_URL="postgresql://user:password@host:5432/db"

# Usa contraseñas fuertes
ADMIN_PASSWORD="contraseña-muy-segura-con-caracteres-especiales"
```

### Base de Datos

- Usa PostgreSQL en producción (no SQLite)
- Habilita SSL para conexiones
- Usa usuarios con permisos limitados
- Realiza backups regulares

### Servidor

- Usa HTTPS en producción
- Configura CORS apropiadamente
- Implementa rate limiting
- Usa un firewall
- Mantén el sistema operativo actualizado

## Dependencias de Seguridad

Usamos las siguientes herramientas para mantener la seguridad:

- **npm audit**: Escaneo de vulnerabilidades en dependencias
- **Dependabot**: Actualizaciones automáticas de seguridad
- **GitHub Security Advisories**: Alertas de seguridad

## Historial de Seguridad

Ver [Security Advisories](https://github.com/2chris34/Cristian/security/advisories) para un historial de vulnerabilidades reportadas y resueltas.

---

**Última actualización**: 2026-02-02

---

## Postura de Seguridad (actualización 2026-08)

### Checklist OWASP Top 10 (2021)

| # | Categoría | Estado | Implementación |
|---|-----------|--------|----------------|
| A01 | Broken Access Control | ✅ | Middleware de autorización multi-tenant (X-Institute-Slug + verificación de pertenencia en el backend); roles ADMIN/TEACHER/STUDENT/TUTOR validados por ruta; authz en `/api/users` re-habilitada con tests. |
| A02 | Cryptographic Failures | ✅ | Passwords con bcrypt (cost 12); JWT firmados con secreto ≥32 chars; password de Postgres rotado y removido del historial activo de tracked files. |
| A03 | Injection | ✅ | Prisma (query parametrizado) y Zod (validación de entrada); sin concatenación de SQL. |
| A04 | Insecure Design | ✅ | Rate limit anti fuerza bruta en login (10/min por IP+email, 200/min por usuario, con `Retry-After`); validación de contraseña (mínimo 8 chars, complejidad). |
| A05 | Security Misconfiguration | ✅ | Helmet (security headers), CORS restringido, `secure` cookies en producción, `.env.*` gitignored con `.example`, uploads con límite de tamaño. |
| A06 | Vulnerable Components | ⚠️ | `npm audit` web = **0**; backend = **3 high residual** (ver abajo). Dependabot configurado. |
| A07 | Auth Failure | ✅ | JWT access (15m) + refresh (7d) httpOnly; logout con invalidación; superadmin con flujo separado. |
| A08 | Software/Data Integrity | ✅ | `package-lock.json` commiteado; `npm ci` en CI; firmas de integridad en lockfile. |
| A09 | Logging/Monitoring | ✅ | Logger estructurado (pino), monitoreo de almacenamiento, health check de Redis, métricas de caché. |
| A10 | SSRF | ✅ | Sin fetch de URLs controladas por el usuario a hosts internos (proxy `/api` a backend fijo; rewrites de Next validados). |

### Incidente: secreto en historial git

El password de PostgreSQL (`«la vieja, ya cambiada»`) quedó expuesto en `origin/main` (commit `a716d8c`). **Mitigación aplicada**:
- Password **rotado** (`«la de tu .env»` en entornos locales, gitignored).
- `.env.test` y `.env.development` des-trackeados + `.env.*.example` commiteados.
- Scripts dev usan fallback `postgres:postgres` (sin secretos).

**Decisión**: NO se reescribió el historial (force-push) por riesgo en el monorepo multi-proyecto; la rotación es la mitigación estándar aceptada. El password antiguo debe tratarse como comprometido para siempre.

### Riesgos residuales aceptados

| Paquete | Severidad | Razón de aceptación |
|---------|-----------|---------------------|
| `deepmerge-ts <8.0.0` (vía `@prisma/config`) | high | DoS por stack-exhaustion al mergear grafos recursivos. Solo afecta el CLI de prisma al leer config local (no controlada por atacante). El fix (override) rompe el CLI de prisma (pin exacto). Se documenta como aceptado. |

> `uuid` (vía `exceljs`) y `@fastify/static` (vía `@fastify/swagger-ui`) ya están **resueltos**: override `uuid@^11.1.1` a nivel raíz y `@fastify/swagger-ui@6.1.1` respectivamente. El único residual del audit backend es `deepmerge-ts` (3 high, todos la misma advisory).

### Verificación

- **CI**: jobs `backend` (tests), `backend-typecheck`, `web` (typecheck + lint + build + tests), `web-e2e` (Playwright full-stack + axe WCAG A/AA, con servicios postgres + redis).
- **E2E**: logins autenticados (SuperAdmin UI + instituto API) con **0 violaciones axe** en dashboards.
- **Pruebas**: backend 84/84, web 10/10, e2e 6/6.


## Secretos en el historial público (2026-10-04)

Una revisión encontró, en archivos del repositorio (que es público), tres claves
reales: la de PostgreSQL local (en ocho guiones y en este mismo archivo), la del
superadmin (escrita YA PUESTA en la pantalla `/superadmin/login`, en el README,
en `.env.example` y en `inicio.ps1`) y una clave vieja de la base en
`check-db.mjs`. Se quitaron todas del árbol: los guiones leen el entorno o le
preguntan a la plataforma, y la pantalla del superadmin abre vacía.

**Siguen en el historial de git**, así que hay que darlas por conocidas:

1. Cambiar la contraseña del superadmin (y `SUPERADMIN_PASSWORD` en el `.env`).
2. Cambiar la contraseña de PostgreSQL local (y las URL del `.env`).
3. Si alguna de las dos se usa o se usó en un servidor de verdad, cambiarla allí.
4. Opcional: limpiar el historial (`git filter-repo`) y forzar la subida. Reescribe
   GitHub para todos: solo con el visto bueno del dueño.

Para que no vuelva a pasar: el escaneo de secretos de la integración continua
(ver `ci.yml`).

## La llave maestra: el superadmin (propuesta, 2026-10-04)

El superadmin abre **todos** los liceos. Hoy lo protegen la contraseña, el
límite de intentos por dirección y la rotación de su sesión. Si alguien la
adivina o la roba (una contraseña reutilizada en otro sitio), entra a todo.

**Propuesta** (pendiente de que el dueño la apruebe; no está hecha):

1. **Segundo factor TOTP** (Google Authenticator, Aegis): al entrar, además de
   la contraseña, el código de 6 cifras del teléfono del dueño. Se guarda solo
   la semilla cifrada con una llave del servidor, y 10 códigos de rescate de un
   solo uso para el día que se pierda el teléfono.
2. **Registro de lo que hace** (`registros_del_superadmin`): quién, cuándo,
   desde dónde y qué (crear, suspender o borrar un liceo, ver sus métricas).
   Solo se añade, nunca se borra.
3. **Aviso al correo del dueño** en cada entrada desde una dirección nueva.

Lo que ya defiende el resto (los admins de cada liceo): límite de intentos
por cuenta y dirección (BRUTO-01), llaves que rotan y se anulan al salir, y el
`instituteId` del token mandando sobre todo lo demás (`TENANT_MISMATCH`).

## Revisado en la tanda de robustez (2026-10-04)

| Riesgo | Estado |
|---|---|
| SSRF por los avisos web | **Cerrado**: solo servicios de avisos de verdad (SSRF-01) |
| CSRF | La cookie de renovar es `httpOnly` y `SameSite=lax`; las escrituras van con la credencial en la cabecera, no en cookie |
| XSS por `dangerouslySetInnerHTML` | Dos: un guion fijo del arranque y los datos estructurados de la portada (con `<` escapado). Ninguno lleva texto del usuario |
| Recorrido de rutas en la descarga de la APK | El nombre del paquete pasa por una expresión cerrada antes de tocar el disco |
| Inyección de órdenes en los respaldos | `pg_dump`/`pg_restore` se lanzan con `spawn` y argumentos en lista (sin intérprete); el esquema se valida (`^[a-z0-9_]{1,63}$`) |
| ReDoS | La única expresión construida en tiempo de ejecución escapa su entrada (`config/redis.ts`) |
| Datos personales en los registros | Quitado el correo al pedir cambiar la contraseña; se apunta el id |
| Números correlativos (recibos) | Secuencia de la base con restricción única: dos a la vez no repiten número |
| Librerías | `npm audit` en la CI (falla con un crítico) y Dependabot cada semana |
