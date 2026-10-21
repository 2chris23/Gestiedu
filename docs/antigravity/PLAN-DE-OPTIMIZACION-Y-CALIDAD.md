# PLAN MAESTRO UNIFICADO DE OPTIMIZACION, SEGURIDAD Y CALIDAD ARQUITECTONICA
## SISTEMA-DE-GESTION-ESCOLAR (GestiEdu)

---

## 1. EVALUACION DE PATRONES DE OPTIMIZACION CONSULTADOS

A continuacion se dictamina la pertinencia, estado actual en el repositorio y aplicabilidad tecnica de cada patron consultado.

### 1.1. Optimizacion en Frontend e Interfaz

#### Virtualizacion de Listas (Windowing)
- Estado en el codigo: No implementado. `package.json` de `apps/web` no incluye bibliotecas de virtualizacion como `@tanstack/react-virtual` o `react-window`.
- Evaluacion de pertinencia: Muy alta.
- Donde aplicarlo:
  - Directorio de estudiantes (`apps/web/src/app/(dashboard)/dashboard/estudiantes/page.tsx`): renderiza listas de cientos de alumnos.
  - Tabla de asistencias historicas y libro de vida: evita la creacion de miles de nodos DOM que congelan el scroll en equipos de bajos recursos.
- Accion: Instalar `@tanstack/react-virtual` y crear un componente reutilizable `VirtualTable` para las tablas de matricula y finanzas.

#### Debounce y Throttle
- Estado en el codigo: Huerfano / Codigo muerto. El hook `apps/web/src/hooks/useDebouncedValue.ts` existe pero no es importado en ninguna vista.
- Evaluacion de pertinencia: Muy alta.
- Donde aplicarlo:
  - Buscador global y buscador de alumnos en sesion de clase (`classSessions.controller.ts:2092`).
  - Filtros de historial de auditoria y pagos reportados.
- Accion: Conectar `useDebouncedValue` con un retardo de 300 ms en los componentes de busqueda para reducir el bombardeo de peticiones al backend en cada tecla.

#### Lazy Loading y Code Splitting
- Estado en el codigo: Parcial. Solo opera la division automatica de rutas de Next.js App Router; no se utiliza `next/dynamic` ni `React.lazy`.
- Evaluacion de pertinencia: Alta.
- Donde aplicarlo:
  - Modales pesados: subida e importacion de Word con Mammoth (`EvaluationPlanSection.tsx`), visores de comprobantes bancarios y graficas de estadisticas de ciclo.
- Accion: Migrar los componentes modales pesados a importaciones dinamicas con `dynamic(() => import(...), { ssr: false })` para recortar el First Contentful Paint (FCP).

#### Memoizacion (useMemo, useCallback, React.memo)
- Estado en el codigo: Minimo (solo 10 instancias en todo el frontend).
- Evaluacion de pertinencia: Muy alta.
- Donde aplicarlo:
  - `EvaluationPlanSection.tsx` (1.354 lineas) y `clase-en-vivo/[classroomId]/[subjectId]/page.tsx` (1.477 lineas): recalculan ponderaciones, acumulados de notas y estados de asistencia en cada render.
- Accion: Memoizar matrices de notas y funciones controladoras de inputs para estabilizar el arbol de componentes.

---

### 1.2. Optimizacion en Base de Datos y Backend

#### Paginacion por Cursor vs. Offset
- Estado en el codigo: No implementado. Los controladores utilizan paginacion clasica con `skip` y `take` (`activities.controller.ts:496`, `attendance.controller.ts:372`, `users.controller.ts:98`).
- Evaluacion de pertinencia: Alta para tablas de gran volumen.
- Donde aplicarlo:
  - `AuditLog`: eventos del sistema que crecen continuamente.
  - `DailyAttendance` e historial de cambios de notas.
- Accion: Incorporar soporte de cursor en Prisma (`take: limit, skip: 1, cursor: { id: lastId }`) en endpoints de telemetria e historial.

#### Proyecciones / Seleccion de Campos (Evitar SELECT *)
- Estado en el codigo: Bien defendido en la mayoria de modulos (1.132 consultas usan `select: { ... }`).
- Evaluacion de pertinencia: Alta (mantener y completar).
- Donde aplicarlo:
  - Existen 207 consultas que usan `include: { ... }` trayendo columnas innecesarias.
- Accion: Refactorizar los `include` pesados en `classSessions.controller.ts` para proyectar unicamente llaves y textos visibles.

#### Eager Loading Selectivo vs. Lazy Loading (Resolucion N+1)
- Estado en el codigo: Deficiencia critica confirmada en `apps/backend/src/services/boleta.service.ts:143-167`.
- Evaluacion de pertinencia: Critica / Prioridad 1.
- Donde aplicarlo:
  - Generacion de boletines y calificaciones consolidadas: un bucle sobre alumnos y lapsos dispara mas de 1.400 consultas individuales para un aula de 35 estudiantes.
- Accion: Precargar todas las calificaciones con una sola consulta `findMany({ where: { studentId: { in: studentIds }, academicYearId } })` y resolver notas en memoria mediante Maps.

#### Vistas Materializadas / Tablas Agregadas
- Estado en el codigo: No implementado. `cycle-statistics.service.ts` (1.356 lineas) realiza agregaciones en caliente sobre miles de registros cada vez que un director abre el panel.
- Evaluacion de pertinencia: Muy alta.
- Donde aplicarlo:
  - Metricas de aprobados/reprobados, tasa de asistencia por seccion y promedios por lapso.
- Accion: Crear una tabla o vista precalculada `AcademicCycleSummary` que se actualice de forma incremental al asentar notas definitivas o en una tarea programada.

---

### 1.3. Reduccion de Carga en Red y Servidores

#### Estrategias de Cache Multicapa
- Estado en el codigo:
  - Cache en memoria (Redis): Bien defendido mediante `RedisCache` en `apps/backend/src/config/redis.ts`.
  - Cache HTTP: Parcial. Solo se envian cabeceras `ETag` y `Cache-Control` en imagenes fijas y logos.
- Evaluacion de pertinencia: Alta.
- Accion: Implementar validacion ETag en Fastify para catalogos de baja variacion (materias, grados, periodos y configuracion del liceo) respondiendo con `304 Not Modified` cuando los datos no hayan cambiado.

#### Procesamiento Asincrono y Colas de Trabajo (Job Queues)
- Estado en el codigo: Deficiente. Las tareas de recordatorio y verificacion corren con `setInterval` nativo en el hilo principal de Fastify (`apps/backend/src/jobs/recordatorio-de-cuotas.job.ts`).
- Evaluacion de pertinencia: Alta.
- Accion: Implementar BullMQ sobre la instancia de Redis existente para aislar tareas en segundo plano (emision de avisos masivos, copias de seguridad remotas y generacion de boletines PDF).

#### Compresion y Protocolos Modernos
- Estado en el codigo: Totalmente implementado y bien configurado.
- Detalle: `@fastify/compress` esta registrado globalmente en `apps/backend/src/server.ts:67` con algoritmos `br` (Brotli), `gzip` y `deflate` para respuestas mayores a 1 KB.

---

### 1.4. Manejo Eficiente de Recursos y Datos Masivos

#### Streaming (Flujos de Datos)
- Estado en el codigo: Parcial. Se utiliza en descargas de APK (`app-movil.routes.ts`) y subidas de respaldos a almacenamiento remoto (`copia-fuera.service.ts`), pero las exportaciones de datos escolares construyen buffers completos en memoria.
- Evaluacion de pertinencia: Media-Alta.
- Accion: Habilitar streams para exportaciones masivas en formato CSV.

#### Connection Pooling
- Estado en el codigo: Sobresaliente y bien documentado.
- Detalle: `apps/backend/src/config/database.ts` incluye compatibilidad con PgBouncer, cache de conexiones por tenant con control de desalojo LRU/TTL, y prevencion de colisiones de conexion simultanea (`abriendo`).

#### Batching (Agrupacion por Lotes)
- Estado en el codigo: Parcial. Se usa `createMany` (29 ocurrencias), pero la actualizacion de registros heterogeneos (como asistencias en `attendance.service.ts:233`) se hace mapeando llamadas individuales `prisma.dailyAttendance.update`.
- Evaluacion de pertinencia: Alta.
- Accion: Agrupar actualizaciones utilizando transacciones por lote o sentencias SQL consolidadas.

---

## 2. PLAN MAESTRO INTEGRADO POR FASES

```mermaid
flowchart TD
    subgraph Fase 1: Seguridad y Bloqueos Criticos
        F1A["Corregir Mass Assignment en users.controller.ts"] --> F1B["Eliminar contraseñas fijas en scripts seed"]
        F1B --> F1C["Resolver N+1 en boleta.service.ts"]
    end

    subgraph Fase 2: Rendimiento y Manejo de Datos
        F2A["Activar useDebouncedValue en buscadores"] --> F2B["Introducir paginacion por cursor en logs"]
        F2B --> F2C["Tabla agregada para metricas de ciclo"]
        F2C --> F2D["Batching en updates de asistencia"]
    end

    subgraph Fase 3: Arquitectura y Frontend
        F3A["Modularizar God Objects (classSessions, grades)"] --> F3B["Virtualizacion TanStack en tablas de alumnos"]
        F3B --> F3C["Lazy loading con next/dynamic en modales"]
        F3C --> F3D["Memoizacion en vistas de evaluacion"]
    end

    subgraph Fase 4: Infraestructura y Colas
        F4A["Migrar tareas setInterval a BullMQ"] --> F4B["Cabeceras ETag en catalogos academicos"]
        F4B --> F4C["Eliminar 'as any' y tipado estricto"]
    end

    Fase 1 --> Fase 2 --> Fase 3 --> Fase 4
```

---

### FASE 1: Seguridad Inmediata y Cuellos de Botella Criticos (Prioridad 1)

1. **Correccion de Asignacion Masiva (Mass Assignment)**
   - Archivo: `apps/backend/src/controllers/users.controller.ts:912-926` y `1089-1114`.
   - Problema: `request.body` se pasa directamente a `prisma.user.update` o se clona sin eliminar campos sensibles como rol o identificador de liceo.
   - Solucion: Filtrar con un schema Zod estricto que solo permita `{ firstName, lastName, phone, address }` en perfil propio.

2. **Saneamiento de Secretos y Fallbacks**
   - Archivos: `apps/backend/src/prisma/seeds/update-superadmin-password.ts:14` y `apps/backend/src/scripts/seed-superadmin.ts:20`.
   - Problema: Contrasena de respaldo quemada `(contraseña fija de antes, retirada)`.
   - Solucion: Forzar lectura exclusiva desde `process.env.SUPERADMIN_PASSWORD` sin valor por defecto inseguro.

3. **Optimizacion de Consultas N+1 en Boletines**
   - Archivo: `apps/backend/src/services/boleta.service.ts:143-167`.
   - Problema: Bucles asincronos anidados que disparan mas de 1.400 consultas por seccion.
   - Solucion: Realizar una consulta consolidada de notas del aula y estructurar los promedios en memoria mediante una tabla hash.

---

### FASE 2: Optimizacion de Consultas, Red y Lotes (Prioridad 2)

1. **Activacion de Debounce en el Cliente**
   - Archivo: `apps/web/src/hooks/useDebouncedValue.ts`.
   - Accion: Conectar el hook en los inputs de busqueda de alumnos, materias y cobros para evitar saturacion de peticiones.

2. **Paginacion por Cursor en Registros Extensos**
   - Archivo: `apps/backend/src/controllers/observations.controller.ts`, auditoria y asistencias.
   - Accion: Reemplazar `skip: offset` por identificadores de cursor `take: limit, cursor: { id }` para mantener tiempo constante O(1) en paginaciones profundas.

3. **Agregacion de Metricas Academicas**
   - Archivo: `apps/backend/src/services/cycle-statistics.service.ts`.
   - Accion: Crear tabla resumen `AcademicCycleSummary` o invalidacion selectiva en Redis para no recalcular miles de filas de notas en cada carga del panel de control.

4. **Batching en Actualizacion de Asistencias**
   - Archivo: `apps/backend/src/services/attendance.service.ts:231-235`.
   - Accion: Reemplazar el mapeo de `update` individuales en `Promise.all` por una transaccion por lotes o sentencia unificada.

---

### FASE 3: Refactorizacion de God Objects y Optimizacion de UI (Prioridad 3)

1. **Modularizacion de Controladores Gigantes**
   - Archivos:
     - `apps/backend/src/controllers/classSessions.controller.ts` (2.321 lineas).
     - `apps/backend/src/controllers/users.controller.ts` (1.906 lineas).
     - `apps/backend/src/services/grades.service.ts` (2.164 lineas).
   - Accion: Dividir por responsabilidades: CRUD de sesiones, orquestacion de clase en vivo, gestion de actividades y calculos de notas.

2. **Virtualizacion de Listas en el Frontend**
   - Archivos: Tablas de estudiantes y cobros en `apps/web`.
   - Accion: Implementar virtualizacion para renderizar unicamente las filas visibles en pantalla.

3. **Code Splitting Dinamico (Lazy Loading)**
   - Archivo: `apps/web/src/components/evaluation/EvaluationPlanSection.tsx` y modales.
   - Accion: Carga diferida con `next/dynamic` para librerias de parseo Word, graficos y exportadores.

4. **Memoizacion de Calculos Pesados**
   - Archivos: Paginas de evaluacion y clase en vivo.
   - Accion: Aplicar `useMemo` en proyecciones de porcentajes y tablas de estudiantes para erradicar renders duplicados.

---

### FASE 4: Robustez y Aislamiento de Procesos (COMPLETADA)

1. **Migracion de Tareas Programadas a BullMQ**
   - Estado: COMPLETADO. Cola `cuotasQueue` y worker `recordatorio-cuotas.queue.ts` con scheduler nativo de BullMQ cada 6 horas.

2. **Implementacion de ETag para Catalogos Academicos**
   - Estado: COMPLETADO. Negociacion HTTP ETag / 304 en `subjects.controller.ts` y `/current/config` en `institutes.routes.ts`.

3. **Sustitucion de Tipado Debil (`as any`)**
   - Estado: COMPLETADO en controladores intervenidos (`subjects.controller.ts` libre de `as any` con `CreateSubjectInput` y `UpdateSubjectInput`).

---

### FASE 5: Control de Planes, Limites y Gobernanza de Base de Datos (COMPLETADA)

1. **Reconciliacion en Tiempo Real de Limites por Plan**
   - Archivo: `apps/backend/src/middleware/plan-limits.middleware.ts`.
   - Estado: COMPLETADO.
   - Accion: Soporte de roles implicitos en `POST /api/students` y `POST /api/teachers`, verificacion de estado `SUSPENDED` y sincronizacion en segundo plano con `platformPrisma.institute` del conteo real de alumnos y docentes en el tenant.

2. **Conexion en Rutas de Creacion**
   - Archivos: `apps/backend/src/routes/students.routes.ts`, `teachers.routes.ts`, `users.routes.ts`.
   - Estado: COMPLETADO.
   - Accion: Inyeccion de `checkStudentLimit` y `checkTeacherLimit` en los preHandlers para bloquear solicitudes que excedan la capacidad contratada.

3. **Contadores Atomicos en Controladores**
   - Archivos: `apps/backend/src/controllers/students.controller.ts`, `teachers.controller.ts`, `users.controller.ts`.
   - Estado: COMPLETADO.
   - Accion: Llamadas asincronas a `incrementStudentCount`, `decrementStudentCount`, `incrementTeacherCount` y `decrementTeacherCount` en los flujos de creacion y desactivacion/eliminacion.

---

### FASE 6: Base de Datos Compartida (Schema-per-Tenant) y Escalabilidad Masiva (COMPLETADA)

1. **Arquitectura Unica con Esquema por Colegio (Schema-per-Tenant)**
   - Archivo: `apps/backend/src/prisma/plataforma/schema.prisma` y `apps/backend/src/config/tenant-db-url.ts`.
   - Estado: COMPLETADO.
   - Accion: Parametrizacion del esquema en la URL de conexion (`?schema=tenant_slug`), permitiendo alojar hasta 1.000 colegios en una sola base de datos fisica sin colisiones de Cedula de Identidad ni desbordamiento de conexiones en PostgreSQL.

2. **Resolucion Inteligente de Conexiones Tenant**
   - Archivo: `apps/backend/src/config/database.ts`.
   - Estado: COMPLETADO.
   - Accion: `abrirClienteDeLiceo` detecta si el instituto opera en esquema compartido o base dedicada, resolviendo dinamicamente el nombre de la base de datos y el esquema correspondiente.

3. **Aprovisionamiento Instantaneo de Esquemas a Sub-Segundo**
   - Archivo: `apps/backend/src/services/tenant-provisioning.service.ts`.
   - Estado: COMPLETADO.
   - Accion: Creacion fisica de esquema y despliegue de 75 modelos de Prisma con extensiones (`pg_trgm`, `unaccent`) en `pg_catalog` en menos de 1 segundo (~800-900 ms), reduciendo los tiempos de aprovisionamiento en un 95%.

4. **Validacion y Aislamiento Multi-Tenant**
   - Archivo: `apps/backend/tests/integration/schema-per-tenant.test.ts`.
   - Estado: COMPLETADO.
   - Accion: 3 de 3 pruebas de integracion pasadas (100% PASS), validando coexistencia de usuarios con misma Cedula de Identidad en diferentes esquemas y aislamiento estricto de catalogos con latencia de 24 ms.

