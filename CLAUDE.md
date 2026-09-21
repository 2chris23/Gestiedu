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
cd apps/backend && npx jest         # 797 pruebas (integración + cálculo)
npm run test:e2e                    # 198 pruebas de navegador (Playwright), con los dos servidores arriba
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
npm run medir:estres        # estrés incremental: 5→500 personas, se para donde se dobla
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
- **Las llaves guardadas de las pruebas de navegador se cambian al prestarlas.**
  `tests/e2e/helpers.ts` guarda la sesión en disco para no chocar con el límite
  de intentos de entrada; como la llave de volver a entrar es de un solo uso
  (rotación), repartir la misma a cinco pruebas dejaba catorce en rojo por algo
  que el producto hace bien. `loginApi` la renueva antes de devolverla.

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
(`assertClassroomScope`, `canSeeStudent`, `canSeeClassroom`).

**Mirar no es tocar.** `assertClassroomScope` es para ESCRIBIR en una sección;
`assertCanSeeClassroom` es para LEER lo que pasa en ella, y ahí entran también el
alumno que estudia allí y su representante: su horario, el tema de la semana, las
actividades del día y los reemplazos son suyos. Sin ese segundo guardián, el
alumno no podía ver ni su propio horario (salía en blanco) y cualquier profesor
podía asomarse a una sección ajena con solo cambiar el id de la dirección. El guardián del navegador es la puerta
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

## Pagos

Módulo que cada liceo activa en Configuración → Pagos (tablas `payment_settings`,
`student_payment_plans`, `payments`, `payment_allocations`). Apagado, todas sus rutas
responden 403. Dinero **en céntimos enteros**; reglas en `MAPA_DE_CALCULOS.md` §8b.
Un pago **no se borra**: se anula con motivo. Solo el admin cobra; el representante
ve lo de sus representados. Cambiar la frecuencia con pagos en el ciclo: 409.

## Suspender y reemplazar clases

**Solo el admin suspende.** Puede poner otra materia de la sección en ese hueco
(`class_replacements`), solo si su profesor está libre. Ver `class-replacements.service.ts`.

## Lo que ve cada rol en las listas

`GET /api/classrooms` daba TODAS las secciones a cualquiera con sesión. Parecía
inofensivo —solo nombres— y no lo era: el calendario abre la PRIMERA de la
lista, así que al profesor le tocaba una ajena y el servidor respondía 403; en
la pantalla se veía como «el calendario sale roto». Ahora el profesor recibe las
que guía y aquellas donde imparte (`las-secciones-que-me-tocan.test.ts`).

**Y el rol lo dice el servidor.** Las pantallas lo leían del almacén del
navegador (`auth.store`), que en la primera pintada todavía está vacío: durante
ese instante un alumno pasaba por personal y pedía lo que no es suyo. Para eso
está `hooks/useQuienSoy.ts`.

## El portal de cada liceo

`/instituto/<liceo>/login` y `/instituto/<liceo>` se abren **sin sesión**: son
la puerta que se le da a la gente del liceo. Estaban protegidas, así que quien
llegaba a entrar acababa en `/login` sin liceo, que responde «no existe»
(ABRE-07). El resto de `/instituto/<liceo>/...` sigue pidiendo sesión, y cuando
el guardián manda a `/login` lleva el liceo en la dirección.

## Contraste

Se mide en el navegador: `tests/e2e/contraste.spec.ts` (axe) y
`apps/web/src/lib/colores-que-existen.test.ts`. Un tamaño, sombra o radio nuevo en
`tailwind.config.js` va también en `lib/utils.ts` (si no, `cn()` borra colores).

## Hora y fecha

La hora la pone el servidor, no el dispositivo: `src/utils/school-time.ts` con la zona
del instituto y `GET /api/time`. Un alumno que cambie la hora de su teléfono o use una
VPN no mueve nada. En el frontend se usa `useSchoolToday()`, nunca `new Date()` a secas.

## Turnos: mañana y tarde

Hay liceos que dan el mismo año dos veces, con otros alumnos y otros profesores
(`classrooms.shift`: `MANANA` | `TARDE` | `INTEGRAL`). El turno **decide las horas
del horario**: una sección de la tarde empieza a la una, y si se pinta la rejilla
de la mañana su horario sale vacío (`useSchedulePeriods(turno)`).

Se dice siempre igual —mismo color, mismo icono, misma palabra— desde
`lib/turnos.ts` y `components/common/TurnoBadge.tsx`. Tres pantallas tenían tres
paletas distintas para lo mismo.

## La clase en vivo

- **Se guarda sola.** No hay botón «Guardar»: lo marcado se manda solo, agrupando
  lo que cae seguido (una tanda de treinta alumnos es UNA petición), y al salir de
  la pantalla se manda lo que quedara pendiente. Arriba se ve «Guardado 07:45».
- **«Pasar asistencia»** cambia la tabla entera: fuera notas y observaciones, y
  cada alumno con sus cuatro botones a la vista, de un toque.
- **Los dos contadores del horario en vivo no son lo mismo**, y esto se confundió
  una vez: *Hoy* es lo que toca hacer en esa clase; *Próx.* es lo que se DEJÓ en
  esa clase para otro día. `Próx.` solo cuenta lo que nació en la sesión de ESE
  día (`classActivity.classSessionId`), no toda actividad pendiente de la materia.

## La sesión

- **La llave de volver a entrar se cambia en cada uso** (rotación). La anterior
  sigue valiendo `GRACIA_DE_ROTACION_MS` (30 s) porque dos pestañas renuevan a la
  vez y mandan la misma; pasado eso, no vale. Ver `auth.service.refreshToken`.
- **Al cerrar sesión, el token de acceso deja de servir en el acto** (lista de
  anulados en la memoria rápida), no a los quince minutos.
- Cada token de acceso lleva su propio número de serie (`jwtid`): dos sesiones
  abiertas en el mismo segundo ya no salen idénticas letra por letra.

## En el teléfono

Barra de tareas abajo (`components/layout/BarraInferiorMovil.tsx`), donde está el
pulgar, con el menú completo en el centro. Se esconde en pantalla grande, respeta
la barra de gestos del teléfono (`env(safe-area-inset-bottom)`) y cada botón mide
44 px de alto. El contenido lleva `pb-28` en móvil para que la barra no tape el
último botón de la pantalla.

## La app del teléfono

Dos caminos, la misma web: **instalarla desde el navegador** (ya funciona: ficha
por liceo en `app/manifest.webmanifest/route.ts`, iconos y `public/sw.js`) y la
**APK** (`apps/movil`, Capacitor). Las dos enseñan el sistema que vive en el
servidor del liceo, así que una nota corregida se ve en el acto y no hay que
actualizar nada desde una tienda.

El icono NO es el logo tal cual: el logo de un liceo es apaisado y el teléfono
lo estira o le come los bordes al recortarlo. El servidor lo redibuja en
cuadrado sobre el color del liceo (`GET /institutes/current/icono`).

`node apps/movil/scripts/preparar-liceo.mjs --liceo=… --url=…` deja el proyecto
de Android listo para ESE liceo. La llave de firma no se genera ni se guarda
desde el repositorio: es la identidad del liceo en Google Play. Todo en
`docs/APP-MOVIL.md`.

## Dónde se anota lo que se hace

- `docs/AUDITORIA-FUNCIONAL.md` — auditoría funcional y el porcentaje de avance.
- `docs/MAPA_DE_CALCULOS.md` — toda regla de cálculo.
- `docs/DESPLIEGUE.md` — despliegue y operación.
- `docs/APP-MOVIL.md` — la app del teléfono: PWA y APK.
