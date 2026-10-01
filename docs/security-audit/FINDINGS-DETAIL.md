# Detalle Técnico de Hallazgos de Seguridad (Findings Detail)
**Sistema de Gestión Escolar Multi-Liceo**  
**ID de Ejecución**: `run-20260919-01`

Este documento expone la evidencia detallada, traza completa de ejecución y remediación recomendada para cada vulnerabilidad confirmada.

---

### 1. auth-superadmin-cookie-httponly-missing (Severidad ALTA)
* **Archivo y Línea**: `apps/web/src/app/api/superadmin/auth/login/route.ts:53` y `apps/web/src/store/superadmin-auth.store.ts:20`
* **CWE**: CWE-1004 (Sensitive Cookie Without 'HttpOnly' Flag), CWE-922 (Insecure Storage of Sensitive Information)
* **Traza**:
  1. [entrypoint] `apps/web/src/app/api/superadmin/auth/login/route.ts:16` - Autenticación de SuperAdmin mediante Next.js route handler.
  2. [propagation] `apps/web/src/app/api/superadmin/auth/login/route.ts:53` - La cookie `superadmin_access_token` se define con `httpOnly: false`.
  3. [sink] `apps/web/src/store/superadmin-auth.store.ts:20` - El token bearer se persiste en `localStorage` del navegador mediante Zustand.
* **Impacto**: Cualquier vulnerabilidad XSS o script de terceros en el navegador puede acceder al token JWT del SuperAdmin de la plataforma, permitiendo el control global de todas las instituciones y bases de datos.
* **Remediación**: Configurar `httpOnly: true` en las cookies de autenticación de SuperAdmin y eliminar el almacenamiento del token en `localStorage`.

---

### 2. auth-superadmin-logout-revocation-broken (Severidad ALTA)
* **Archivo y Línea**: `apps/web/src/app/api/superadmin/auth/logout/route.ts:18` y `apps/backend/src/middleware/superadmin-auth.middleware.ts:41`
* **CWE**: CWE-613 (Insufficient Session Expiration)
* **Traza**:
  1. [entrypoint] `apps/web/src/app/api/superadmin/auth/logout/route.ts:4` - SuperAdmin solicita cerrar sesión en la interfaz web.
  2. [propagation] `apps/web/src/app/api/superadmin/auth/logout/route.ts:18` - Next.js envía petición POST al backend con el cuerpo `{ refreshToken }`, pero omite la cabecera `Authorization: Bearer <token>`.
  3. [sink] `apps/backend/src/middleware/superadmin-auth.middleware.ts:41` - El backend exige cabecera Bearer y responde con `401 SUPERADMIN_AUTH_REQUIRED`. La revocación en BD jamás se ejecuta.
* **Impacto**: Los tokens de refresco del SuperAdmin permanecen indefinidamente activos en la tabla `super_admin_refresh_tokens` tras el cierre de sesión, posibilitando ataques de reenganche de sesión.
* **Remediación**: Enviar la cabecera `Authorization: Bearer <token>` desde el route handler de Next.js, o permitir al backend revocar el refresh token validando su presencia en el cuerpo de la solicitud.

---

### 3. idor-single-grade-lookup (Severidad ALTA)
* **Archivo y Línea**: `apps/backend/src/routes/grades.routes.ts:112` y `apps/backend/src/controllers/grades.controller.ts:215`
* **CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key / IDOR)
* **Traza**:
  1. [entrypoint] `apps/backend/src/routes/grades.routes.ts:112` - Solicitud `GET /api/grades/:id`. Solo requiere `authenticate` sin chequeo de rol.
  2. [propagation] `apps/backend/src/controllers/grades.controller.ts:215` - `getGrade` consulta la nota por ID junto con estudiante, docente y materia sin verificar el usuario que llama.
  3. [sink] `apps/backend/src/controllers/grades.controller.ts:284` - Se envía la nota completa, retroalimentación y datos personales a cualquier solicitante autenticado.
* **Impacto**: Fuga masiva de privacidad académica. Cualquier alumno o representante puede ver las notas, comentarios y observaciones de cualquier otro estudiante del colegio.
* **Remediación**: En `getGrade`, aplicar `assertCanSeeStudent` para estudiantes y tutores, y `assertClassroomScope` para docentes.

---

### 4. grades-null-classroom-scope-bypass (Severidad ALTA)
* **Archivo y Línea**: `apps/backend/src/services/grades.service.ts:180` y `apps/backend/src/controllers/grades.controller.ts:35`
* **CWE**: CWE-285 (Improper Authorization)
* **Traza**:
  1. [entrypoint] `apps/backend/src/routes/grades.routes.ts:192` - Docente envía nota para una actividad institucional/general (`classroomId` nulo).
  2. [propagation] `apps/backend/src/services/grades.service.ts:180` - La condición `if (activity.classroomId)` evalúa falso y omite la validación de asignación docente.
  3. [sink] `apps/backend/src/services/grades.service.ts:215` - Se crea la nota en la base de datos sin comprobar si el docente imparte clases en esa materia.
* **Impacto**: Cualquier profesor puede calificar, alterar o borrar notas de cualquier alumno en materias o secciones no asignadas para evaluaciones de alcance institucional.
* **Remediación**: Resolver la sección matriculada del alumno y forzar la validación de pertenencia del docente (`classroomSubject`), sin permitir bypass cuando `classroomId` sea nulo.

---

### 5. filesystem-path-traversal-delete-old-file (Severidad ALTA)
* **Archivo y Línea**: `apps/backend/src/middleware/upload.middleware.ts:63, 73`
* **CWE**: CWE-22 (Path Traversal)
* **Traza**:
  1. [entrypoint] `apps/backend/src/routes/institutes.routes.ts:382` - Administrador de liceo actualiza configuración (`logo` o `favicon`) con ruta maliciosa (`../../package.json`).
  2. [propagation] `apps/backend/src/controllers/institutes.controller.ts:198` - Se invoca `deleteOldFile` con la ruta almacenada.
  3. [sink] `apps/backend/src/middleware/upload.middleware.ts:73` - Se ejecuta `fs.unlinkSync` sobre la ruta resuelta con `path.join(process.cwd(), cleanPath)`.
* **Impacto**: Eliminación arbitraria de archivos en el servidor con los privilegios del proceso Node.js (código fuente, variables de entorno, manifiestos).
* **Remediación**: Verificar estrictamente que la ruta canónica (`path.resolve`) comience con el directorio permitido (`uploads/`) antes de ejecutar `fs.unlinkSync`.

---

### 6. ratelimit-bypass-unauthenticated-header (Severidad ALTA)
* **Archivo y Línea**: `apps/backend/src/server.ts:87-104`
* **CWE**: CWE-799 (Improper Control of Generation of Code or Resource Consumption)
* **Traza**:
  1. [entrypoint] `apps/backend/src/server.ts:87` - Petición HTTP entrante a rutas públicas (`/health`, `/api/auth/login`) con cabecera `Authorization: Bearer <random>`.
  2. [propagation] `apps/backend/src/server.ts:93` - El generador `cupoDeLaPeticion` genera una clave basada en el hash de la cabecera arbitraria: `s:<sha256>`.
  3. [sink] `apps/backend/src/server.ts:95` - El limitador de tasa incrementa un bucket nuevo, ignorando la IP del cliente y evitando el límite de peticiones.
* **Impacto**: Ataques de fuerza bruta y *credential stuffing* sin restricciones en el endpoint de login, así como ataques de denegación de servicio contra rutas públicas.
* **Remediación**: Restringir las claves de sesión únicamente a rutas con autenticación verificada; todas las peticiones públicas o sin verificar deben limitarse exclusivamente por IP (`ip:${request.ip}`).

---

### 7. payments-missing-idempotency-race-condition (Severidad ALTA)
* **Archivo y Línea**: `apps/backend/src/controllers/pagos.controller.ts:489, 504` y `apps/backend/src/prisma/schema.prisma:1228`
* **CWE**: CWE-362 (Race Condition), CWE-834 (Excessive Iteration / Double Payment)
* **Traza**:
  1. [entrypoint] `apps/backend/src/routes/pagos.routes.ts:70` - Administrador registra un pago de abono parcial.
  2. [propagation] `apps/backend/src/controllers/pagos.controller.ts:489` - Se adquiere el bloqueo transaccional, pero la verificación solo comprueba si la cuota ya está saldada (`pendingCents === 0`).
  3. [sink] `apps/backend/src/controllers/pagos.controller.ts:514` - Si llegan dos solicitudes idénticas con abonos parciales, la segunda se ejecuta secuencialmente y crea un segundo registro de pago por el mismo concepto.
* **Impacto**: Cobro duplicado a estudiantes/representantes y alteración de los libros contables de la institución.
* **Remediación**: Exigir cabecera `Idempotency-Key` almacenada en Redis y aplicar restricción única en BD sobre el número de referencia bancaria por ciclo escolar.

---

### 8. auth-bypass-logout-access-token (Severidad MEDIA)
* **Archivo y Línea**: `apps/backend/src/controllers/auth.controller.ts:134` y `apps/backend/src/middleware/auth.middleware.ts:70`
* **CWE**: CWE-613 (Insufficient Session Expiration)
* **Remediación**: Añadir identificador único de sesión (`jti`) al token JWT y verificar en Redis que la sesión siga activa al autenticar.

---

### 9. auth-refresh-token-rotation-missing (Severidad MEDIA)
* **Archivo y Línea**: `apps/backend/src/services/auth.service.ts:241`
* **CWE**: CWE-384 (Session Fixation)
* **Remediación**: Implementar rotación estricta de tokens de refresco (RTR) según RFC 6819.

---

### 10. dos-health-check-db-pool-exhaustion (Severidad MEDIA)
* **Archivo y Línea**: `apps/backend/src/server.ts:293` y `apps/backend/src/plugins/no-aceptar-mas-de-lo-que-aguanta.ts:49`
* **CWE**: CWE-400 (Uncontrolled Resource Consumption)
* **Remediación**: Separar en `/health/live` (en memoria sin consultas) y `/health/ready` (con chequeo de BD y rate limit).

---

### 11. parser-docx-memory-exhaustion-eval-plan (Severidad MEDIA)
* **Archivo y Línea**: `apps/backend/src/controllers/evaluation-plan.controller.ts:806, 811`
* **CWE**: CWE-776 (XML Bomb / Decompression Memory Exhaustion)
* **Remediación**: Validar cabeceras mágicas PKZip, limitar tamaño a 2MB e imponer cotas al recorrido síncrono del DOM en Cheerio.

---

### 12. process-plaintext-db-credentials-in-cli-args (Severidad MEDIA)
* **Archivo y Línea**: `apps/backend/src/services/respaldos.service.ts:84, 150`
* **CWE**: CWE-214 (Invocation of Process Using Visible Sensitive Information)
* **Remediación**: Pasar las credenciales de PostgreSQL mediante variables de entorno (`PGPASSWORD`, `PGUSER`) en la opción `env` de `spawn`.
