# Gestiedu

SaaS de gestión escolar multi-liceo. Monorepo: `apps/backend` (Fastify 5 + Prisma 6 +
PostgreSQL) y `apps/web` (Next.js 16 + React 19 + Tailwind).

**Multi-tenant: una base de datos por liceo.** La BD de plataforma guarda la fila del
instituto con sus credenciales; `getTenantPrisma` cachea hasta 50 clientes. El
`instituteId` del token manda: si la petición nombra otro liceo (slug, cabecera,
subdominio o dominio), se rechaza con 401 `TENANT_MISMATCH`. Falla cerrado, siempre.

## Cómo se trabaja aquí

1. **Evidencia antes de corregir.** Nada es un fallo ni "ya funciona" sin código, diff o
   prueba en vivo que lo demuestre. Medir, no deducir.
2. **Las reglas de negocio son configurables por instituto**, nunca fijas en el código.
   Lo del MPPE es solo el valor por defecto.
3. **Una sola sesión de IA sobre este repo a la vez.** Dos bloquean los worktrees y Prisma.
4. Todo cambio de cálculo se anota en `docs/MAPA_DE_CALCULOS.md`.

## Comandos

```bash
cd apps/backend && npm run dev      # API en :3001
cd apps/web && npm run dev          # web en :3000
cd apps/backend && npx jest         # 715 pruebas de integración
npm run test:e2e                    # 154 pruebas de navegador (Playwright), con los dos servidores arriba
cd apps/backend && npm run typecheck
cd apps/backend && npm run migrate:tenants[:status]   # migra todos los liceos
```

Mediciones (cada una dice en su cabecera qué mide y qué NO mide):

```bash
cd apps/backend
npm run medir:pantallas     # lo que tarda cada pantalla, una a una
npm run medir:concurrencia  # mucha gente a la vez
npm run medir:aguante       # 20 min seguidos: ¿se arrastra? ¿se llena la memoria?
npm run medir:pozo          # el tope de conexiones, en la base y por la API
npm run probar:pgbouncer    # el repartidor, levantado de verdad (ver la cabecera)
```

**Nunca arranques los servidores con tuberías** (`npm run dev | head -20`): la tubería se
cierra, llega SIGPIPE y el proceso muere. Cuesta horas de pruebas falsas en rojo.

## Trampas conocidas

- **Next 16 usa `src/proxy.ts`, no `middleware.ts`.** Si existen los dos, la app no arranca.
  El guardián de pantallas por rol vive en `apps/web/src/proxy.ts`.
- **Migraciones: `prisma migrate deploy`, jamás `db push --accept-data-loss`.**
  `src/scripts/push-all-dbs.ts` es un tope que se niega a correr, a propósito.
- Las migraciones necesitan conexión **directa**, no PgBouncer (el pooling por transacción
  rompe los bloqueos de Prisma Migrate). Ver `src/config/tenant-db-url.ts`.
- Cada archivo de prueba crea **su propia base** (`CREATE DATABASE ... TEMPLATE`) en
  `tests/jest.dbEnvironment.js`. Si una prueba depende de datos de otra, se cae: es lo
  que se busca.
- No edites archivos mientras hay una tanda de pruebas corriendo; salen fallos fantasma.
- Las sustituciones de texto a ciegas ya han corrompido pruebas dos veces
  (`studentId`→`studentIds`, literales SQL). Cambios dirigidos y verificados.

## Reglas del producto que NO son fallos

- **Una actividad "para la próxima clase" solo se anuncia en la clase donde se creó.**
  Así se sabe en qué clase se puso y no se acumulan varias en "próxima clase".
  Está en `classSessions.controller.ts` con su comentario: no cambiar sin hablarlo.

## Permisos (lo que puede cada rol)

- **Estudiante:** solo ve lo suyo — sus datos, sus clases, sus actividades, sus notas.
  No sube, no edita, no agrega nada. **Ni su propio perfil**: eso lo hace el admin.
- **Tutor:** solo ve a los alumnos que tutela.
- **Profesor:** pone notas, asistencia, plan de evaluación y observaciones **solo de las
  clases que imparte**; ve los promedios solo de sus secciones guía. No edita datos
  personales (ni correo, ni nombre, ni los suyos).
- **Admin:** lo demás.

Se comprueba en el servidor con `src/services/authorization.service.ts`
(`assertClassroomScope`, `canSeeStudent`). El guardián del navegador es la puerta
de la casa; la de la caja fuerte es el servidor: aunque alguien falsee la cookie, la
pantalla se abre vacía.

**Dos preguntas, no una.** `authenticate` dice *quién eres*; `requireTeacher` /
`requireAdmin`, *qué rol tienes*; y `assertClassroomScope` / `canSeeStudent`, *si eso
es tuyo*. Una ruta de escritura que solo lleva `authenticate` está abierta: así
estaban seis, y con 696 pruebas en verde por encima (sección 51 de la auditoría).
Al añadir un guardia a una ruta, **pon `authenticate` también en su `preHandler`**:
los guardias se adelantan a `onRequest` (`middleware/guardias.ts`) y sin eso corren
antes de que nadie haya preguntado quién llama, y responden 401 hasta al admin.

## Borrar

**Nada se borra de verdad.** Todo borrado de información del liceo pasa por
`borrarGuardandoCopia()` (`src/utils/papelera.ts`), que guarda una copia completa
de la fila en `registros_borrados` antes de tocarla. Si la copia no se puede
guardar, el borrado no ocurre.

**Y de lo que se lleva la cascada, también.** PostgreSQL borra en cascada: una
materia arrastra sus notas, su plan y sus horarios. La papelera recorre el mapa de
relaciones del esquema y copia todo eso hasta el último nivel, así que una tabla
nueva queda cubierta el día que se añade. Si el borrado pasa de
`PAPELERA_MAX_FILAS` (20.000 por defecto), no se borra nada: para eso está el
respaldo. Sección 52 de la auditoría.

Excepciones a propósito: `refreshToken` (guardar sesiones es guardar llaves) y
`notification` (no es información del liceo).

Borrar un liceo entero hace `DROP DATABASE`, que la papelera no alcanza: se
respalda antes, y sin respaldo no se borra.

## Memoria rápida (lo guardado)

Una base por liceo aísla los **datos**. Lo guardado para no volver a preguntar es
**una sola memoria para todo el servidor**, y ahí el aislamiento lo da la clave.

**El liceo lo pone la memoria, no quien la usa.** `config/ambito-del-liceo.ts`
apunta el liceo de la petición y `RedisCache` lo antepone solo. Quedan fuera, a
propósito, `tenant:`, `institute:info:`, `superadmin:` y `platform:`: no son de
ningún liceo.

**Quien ya sabe de qué liceo es, lo dice:** `conLiceo(instituteId, () => ...)`.
Vale para todo lo que corre fuera de una petición o en sus últimos coletazos
(invalidaciones, ganchos `onSend`/`onResponse`, tareas, guiones). Confiar en el
ambiente ahí es lo que dejó una vez a una cuenta desactivada entrando.

Por qué existe todo esto: sección 47 de `docs/AUDITORIA-FUNCIONAL.md`.

## Tiempo real

El primer aviso de cambio se atiende **al instante**; la ventana de 700 ms solo
absorbe los siguientes (`TiempoRealProvider.tsx`). Antes había un retraso fijo de
800 ms y lo que otro guardaba tardaba 841 ms medidos en verse. No volver a poner
una espera por delante sin medir lo que cuesta el trabajo real: son 41 ms.

## Hora y fecha

La hora la pone el servidor, no el dispositivo: `src/utils/school-time.ts` con la zona
del instituto y `GET /api/time`. Un alumno que cambie la hora de su teléfono o use una
VPN no mueve nada. En el frontend se usa `useSchoolToday()`, nunca `new Date()` a secas.

## Dónde se anota lo que se hace

- `docs/AUDITORIA-FUNCIONAL.md` — auditoría funcional y el porcentaje de avance.
- `docs/MAPA_DE_CALCULOS.md` — toda regla de cálculo.
- `docs/DESPLIEGUE.md` — despliegue y operación.
