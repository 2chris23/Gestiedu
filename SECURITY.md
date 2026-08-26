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

El password de PostgreSQL (`megustaelcoco2003`) quedó expuesto en `origin/main` (commit `a716d8c`). **Mitigación aplicada**:
- Password **rotado** (`82nQKb95S7wNDmuxyvIG6dOYkZUo` en entornos locales, gitignored).
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

