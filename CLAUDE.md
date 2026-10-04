# Gestiedu

SaaS de gestión escolar multi-liceo. Monorepo: `apps/backend` (Fastify 5 + Prisma 6 +
PostgreSQL) y `apps/web` (Next.js 16 + React 19 + Tailwind).

**Multi-tenant: cada liceo, su esquema en una base compartida** (desde oct. 2026;
los de antes pueden seguir en su base propia, esquema `public`). La fila de la
plataforma dice dónde vive (`databaseName` + `databaseSchema`) y nada se adivina.
**Con PgBouncer, una conexión pasa de un liceo a otro**: el SQL escrito a mano
leía el esquema de OTRO liceo (medido: 359 de 400). Por eso el cliente de cada
liceo mete cada consulta a mano y cada transacción en `SET LOCAL search_path`
(`config/esquema-del-liceo.ts`; `npm run probar:aislamiento`, AISLA-*). Borrar
un liceo borra **su esquema**, nunca la base compartida; su respaldo es su
esquema y nada más (BASE-COMP-*). La BD de plataforma guarda la fila del
instituto con sus credenciales; `getTenantPrisma` cachea hasta 250 clientes con
PgBouncer (50 sin él; `CLIENTES_DE_LICEO`). El
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
cd apps/backend && npx jest         # 1258 pruebas en 166 archivos (integración + cálculo)
npm run test:e2e                    # 315 pruebas de navegador (Playwright), con los dos servidores arriba
cd apps/backend && npm run typecheck
cd apps/backend && npm run migrate:plataforma        # la base de la plataforma
cd apps/backend && npm run migrate:tenants[:status]   # migra todos los liceos
```

Las pruebas que necesitan un Redis de verdad (CUPO-*, DOBLE-*) salen **saltadas**
sin `REDIS_PRUEBAS_URL`; aquí: `redis-server --port 6391` y
`REDIS_PRUEBAS_URL=redis://127.0.0.1:6391 npx jest`.

Mediciones (cada una dice en su cabecera qué mide y qué NO mide):

```bash
cd apps/backend
npm run medir:pantallas     # lo que tarda cada pantalla, una a una
npm run medir:concurrencia  # mucha gente a la vez
npm run medir:aguante       # 20 min seguidos: ¿se arrastra? ¿se llena la memoria?
npm run medir:pozo          # el tope de conexiones, en la base y por la API
npm run probar:pgbouncer    # el repartidor, levantado de verdad (ver la cabecera)
npm run medir:estres        # estrés incremental: 5→500 personas, se para donde se dobla
npm run seed:muchos-liceos  # LICEOS=50: muchos liceos pequeños, para medir con LICEOS='muchos-*'
```

Todos guardan su resultado en `docs/mediciones/` (no va al repositorio: es de
una máquina y una tarde).

**Nunca arranques los servidores con tuberías** (`npm run dev | head -20`): la tubería se
cierra, llega SIGPIPE y el proceso muere. Cuesta horas de pruebas falsas en rojo.

## Trampas conocidas

- **Next 16 usa `src/proxy.ts`, no `middleware.ts`.** Si existen los dos, la app no arranca.
  El guardián de pantallas por rol vive en `apps/web/src/proxy.ts`.
- **Una migración nueva empieza con `SET lock_timeout = '10s';`** (MIGRA-01):
  sin tope, un `ALTER` sobre una tabla en uso cuelga al liceo entero mientras
  espera su candado. Un índice sobre una tabla grande, `CONCURRENTLY` y aparte.
- **Migraciones: `prisma migrate deploy`, jamás `db push --accept-data-loss`.**
  `src/scripts/push-all-dbs.ts` es un tope que se niega a correr, a propósito.
- Las migraciones necesitan conexión **directa**, no PgBouncer (el pooling por transacción
  rompe los bloqueos de Prisma Migrate). Ver `src/config/tenant-db-url.ts`.
- **La plataforma tiene SUS migraciones** (`src/prisma/plataforma/`), aparte de las de
  los liceos, y se aplican con `npm run migrate:plataforma`. Prisma busca las
  migraciones junto al esquema: cuando los dos esquemas compartían carpeta, el
  despliegue le aplicaba a la plataforma las de los liceos (PLAT-01…04). Un esquema
  de Prisma nuevo va en su propia carpeta.
- **`.github/` estaba en `.gitignore`**: la integración continua y el despliegue
  automático no llegaron nunca a GitHub. Ya no lo está (`ci.yml`).
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
`notification` (no es información del liceo). La tarea diaria de mantenimiento
tira, con plazo configurable, la papelera vieja, los avisos leídos, las llaves
caducadas y los `cambios_recibidos` viejos (MANT-*); nada del liceo.

Borrar un liceo entero hace `DROP DATABASE`, que la papelera no alcanza: se
respalda antes, y sin respaldo no se borra.

## Respaldos

Cada noche (servicio `respaldos`), **la plataforma primero** (`_plataforma__…dump`:
qué base es de qué liceo y con qué llave) y luego cada liceo; con `BACKUP_S3_*`, una
copia fuera del servidor (R2). `/health` dice si el último fue bien. Antes la
plataforma no se respaldaba: perdido el disco, los archivos de los liceos no se
podían volver a enganchar (RESP-07).

## Varios procesos y muchos liceos

Nada que importe vive ya en la memoria de UN proceso: con `--scale backend=N` todo
sigue valiendo.

- **El cupo de peticiones** cuenta en Redis (`plugins/cupo-compartido.ts`); si
  Redis no contesta, en el proceso. Nunca se apaga ni hace esperar (CUPO-01…04).
- **El freno del doble clic** pone su marca en Redis (`SET NX`): el proceso que
  llega segundo devuelve la respuesta del primero (DOBLE-01…04).
- **Los logos** van a la base de la plataforma (`archivos_de_liceo`), no al disco:
  así los ve todo proceso y entran en el respaldo (LOGO-01…05).
- **nginx**: la API al proceso menos ocupado; el tiempo real, siempre al mismo por
  dirección. Y ningún `location` pone cabeceras propias: en nginx eso le quita
  TODAS las del servidor (al tiempo real le llegaba sin `Host` ni la dirección).
- **200 liceos**: el proceso guarda 250 clientes abiertos con PgBouncer
  (`CLIENTES_DE_LICEO`), y veinte peticiones a la vez de un liceo nuevo abren UNA
  conexión (CONN-10).

Para medirlo: `LICEOS=50 npm run seed:muchos-liceos` y
`LICEOS='muchos-*' CLAVE='Test123!' npm run medir:estres`. Medido en este PC (todo
en la misma máquina, una conexión por liceo): 500 personas en 50 liceos, p95 124 ms,
p99 277 ms, 0 fallos. La prueba en un servidor de verdad está escrita en
`docs/DESPLIEGUE.md` §10-bis.

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

**Cada ciclo tiene SU configuración** (`ajustes_de_pagos_del_ciclo`): se copia
la del liceo al primer pago. Antes había una sola, y subir la cuota recalculaba
los ciclos pasados, que salían «debiendo». Un ciclo cerrado se ve, no se toca
(409 `CICLO_CERRADO`). La pantalla elige el ciclo (`?ciclo=`) y lo enseña como
calendario: los 12 meses arriba y, al tocar uno, sus días.

## Finanzas (octubre 2026)

«Pagos» es ahora **Finanzas** (`/dashboard/pagos`, pestañas Resumen ·
Estudiantes · Personal · Gastos). Va con el módulo de pagos: apagado, también
responde 403. Reglas en `MAPA` §8b y §8g.

- **Fondos disponibles** = todo lo que entró (cuotas y fondos) menos todo lo que
  salió (personal y gastos), desde siempre y sin lo anulado. El dinero con el
  que el liceo empieza va como fondo `SALDO_INICIAL`.
- **Nómina** (`finanzas.service.ts`): profesores con cuenta y otro personal sin
  ella; mensual, quincenal o pago único; vacaciones y bono, de cada persona o
  del liceo. «Guardar para los próximos ciclos» trae a esa persona sola al ciclo
  nuevo. El profesor ve **solo lo suyo** en «Mis pagos».
- **Gastos** con la foto de la factura (WebP, como las fotos de perfil).
- **Becas, hermanos y mora**: se calculan, no se guardan. El descuento es el
  MAYOR entre la beca y el de hermanos, nunca la suma.
- **El representante reporta un pago** con la captura; no cuenta hasta que el
  admin lo confirma (y entonces se cobra con la cuenta de «Registrar pago»).
  Un aviso le recuerda la cuota N días antes (`jobs/recordatorio-de-cuotas.job.ts`),
  una sola vez por cuota aunque haya varios procesos.
- **Reporte del mes** para imprimir: `/dashboard/pagos/reporte?mes=`.
- Sin conexión solo se anotan fondos y gastos (sin la foto); pagar al personal
  y confirmar pagos piden servidor: es dinero y llevan recibo correlativo.

## Asistencia por QR

Tres formas de pasar lista y **la de a mano no se quita nunca**. El profesor abre
un QR en su clase (cambia cada 10 s) y los alumnos lo escanean desde su app; o
él escanea el QR del alumno. El QR solo **identifica**: escribe la misma fila
de `daily_attendance` que el botón de a mano. Lo nuevo es el rastro
(`registros_asistencia_qr`: teléfono, hora, dónde, por qué) y las trabas contra
firmar por otro: un teléfono por alumno (lo desbloquea el admin desde el
perfil, queda anotado), un teléfono registra a UN alumno por clase, y el
**faro**: el alumno tiene que estar cerca del teléfono del profesor; sin GPS
entra «por confirmar» y el profesor lo aprueba (escudo, no muro). Todo
configurable por liceo (`AcademicConfig.asistenciaQr`). Diseño en
`docs/PROXIMAS-FUNCIONES.md` §1; código en `services/asistencia-qr.service.ts`;
pruebas QR-01…14 y QRE-01/02 (con una cámara de mentira que enseña el QR).

**Mientras el QR está abierto, la clase en vivo no guarda la asistencia sola**:
guardaría a todos como «presente» (lo que se ve por defecto) antes de que
escaneen. La escribe el servidor alumno a alumno.

**Guardar las reglas académicas borraba el resto de la configuración** (la
escala de notas, el horario…): `updateAcademicConfig` escribía solo sus campos.
Ahora mezcla con lo que había.

## Suspender y reemplazar clases

**Solo el admin suspende.** Puede poner otra materia de la sección en ese hueco
(`class_replacements`), solo si su profesor está libre. Ver `class-replacements.service.ts`.

**Un día sin clases** es un evento con la franja del día entero (`00:00–23:59`,
`DIA_ENTERO` en `hooks/useSchoolEvents.ts`): doble clic en el día del
calendario de Eventos, o su botón en el panel, y se elige todo el liceo, unos
años o unas secciones. El panel del día tiene Mañana y Tarde: antes pintaba
solo la rejilla de la mañana (EVENTO-UI-01/02).

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
- **«Pasar asistencia»** pregunta primero cómo (a mano, con el QR en la mesa o
  escaneando a cada alumno) y, a mano, cambia la tabla entera: fuera notas y
  observaciones, y cada alumno con sus cuatro botones a la vista, de un toque.
- **Evaluar a un alumno de otra forma** («no puede hacer deporte: se le evalúa
  con el cuaderno»): botón «Otra forma» en su casilla al calificar. Su nota
  cuenta igual; queda anotado el método (`ClassActivity.evaluadoDeOtraForma`,
  por alumno) y lo ven él y su representante («Evaluado con: Cuaderno»).
- **Los dos contadores del horario en vivo no son lo mismo**, y esto se confundió
  una vez: *Hoy* es lo que toca hacer en esa clase; *Próx.* es lo que se DEJÓ en
  esa clase para otro día. `Próx.` solo cuenta lo que nació en la sesión de ESE
  día (`classActivity.classSessionId`), no toda actividad pendiente de la materia.

## El horario del liceo

Configuración → Académica: **mañana y tarde por separado**, cada una con hora de
inicio, hora de FIN, duración de la clase y sus recreos. El sistema cuenta las
horas de clase y **no deja guardar lo que no cuadra** («sobran 35 min: que
acabe a las 11:55 o a las 12:35»); el servidor lo revisa igual (400
`HORARIO_NO_CUADRA`) y, si el cambio deja clases ya puestas fuera de la
rejilla, pide confirmarlo (409 `HORARIO_DEJA_CLASES_FUERA`). Una sola cuenta,
copiada en los dos lados como `plan-weeks`: `utils/franjas-del-horario.ts` y
`lib/franjas-del-horario.ts` (FRANJA-01…07). La forma vieja (plana) se lee
como la mañana.

## Las semanas del plan

Cada lapso dice **cuándo empieza el plan de evaluación** (`Period.inicioDelPlan`)
y cómo se llaman las semanas de antes (`nombreAntesDelPlan`, «Diagnóstico» por
defecto): es libre, cada liceo es distinto. Antes de esa fecha la semana es la
**0**. Una sola cuenta: `services/semana-del-plan.service.ts`; la usan la clase
en vivo, el horario en vivo, la rejilla del plan y el calendario. La clase en
vivo contaba desde el inicio del AÑO y la rejilla desde el del LAPSO: en el 2º
y 3er lapso su «Semana N» no era la misma.

## La ficha del alumno

**La cabecera trae lo del admin**: la inscripción como un anillo que se llena
(`avance` de `GET /students/:id/recaudos`: los cinco datos del Ministerio y
cada recaudo; completa, una marca), «Traslado», «Retiro» y «Documentos»
(constancias, carnet, certificación), cada uno con su ventana. **Las
actividades van dentro de cada ciclo**: al pulsar el promedio, todas; al pulsar
una materia, las suyas; respetan el lapso elegido (cada actividad trae su
`periodId`) y al pulsar una se abre su clase. En cada ciclo, la boleta del lapso
que se mira (`/boleta/:id?ciclo=&lapso=`: ese lapso y los anteriores, sin
definitiva) o la completa y las notas parciales (PERFIL-UI-01/02, ACT-04).

## Lo que ve el alumno de su clase

Al tocar una clase en su horario, el alumno (y su representante, con
`?alumno=`) va a **Mi clase** (`/dashboard/mi-clase/<materia>`): el plan de
evaluación, sus actividades con **su** nota y **sus** observaciones. Nada de
los compañeros: el servidor filtra las notas del mapa de la actividad
(`controllers/mi-clase.controller.ts`, MICLASE-01…06). El personal, al tocar,
va a la clase en vivo. Quién mira lo dice `useQuienSoy`, no el perfil abierto.
Arriba en Mi clase van los botones del QR de asistencia («Escanear asistencia»
y «Mi QR»), solo para el alumno: antes vivían en la ventanita que se quitó, y
el alumno se quedó un día sin poder escanear (QRE-01).

**El clic tras un arrastre lo anula Embla** (`components/ui/carril.tsx`). El
carril tenía un freno propio que marcaba «arrastrando» en cualquier pulsación
y se comía los toques: con el horario dentro, tocar una clase no abría nada.
No volver a poner uno.

Las observaciones de grupo daban al alumno y a su representante el nombre, el
código y la foto de los compañeros implicados: `otherInvolved` es ya solo
para el personal (OBS-GRUPO-01).

## Los documentos del liceo

**Datos oficiales del plantel** en Configuración → Información General: nombre
oficial, código DEA, estadístico (6 dígitos), de dependencia (9), zona
educativa, entidad federal, municipio, parroquia y las líneas del ministerio
(`services/datos-del-plantel.service.ts`, PLANTEL-01…04). Van en
`academicConfig.documentos`, en la plataforma, y se **mezclan** con lo que
había: General y Académico (la firma) ya no se borran lo del otro.

**Un solo membrete** (`components/documentos/MembreteOficial.tsx`, de
`GET /institutes/current/membrete`), con el logo del Ministerio a la izquierda
y el del liceo a la derecha (`public/documentos/logo-mppe.png`; el liceo lo
quita en Información General, `logoDelMinisterio`, PLANTEL-05) en la boleta, la constancia, el resumen
final, el plan de evaluación y el acta de compromiso; el horario descargado
lleva el nombre y el DEA (MEMB-UI-01/02). Todo lo de un liceo venezolano, y
dónde vive, en `docs/VENEZUELA-LO-QUE-FALTA.md`. **Nada se envía al Ministerio**:
decidido, el papel sale en su formato y el liceo lo entrega.

**Los textos son del liceo.** Cada constancia (estudio, buena conducta,
prosecución, retiro, inscripción, labor social) sale de una plantilla con
marcadores `{{…}}` que el admin edita en Configuración → Documentos; sin
plantilla propia, la del MPPE (`plantillas-de-documentos.service.ts`). Un
marcador que no existe no se guarda (400 `MARCADOR_DESCONOCIDO`). El resumen
final sale en sus tres tipos (final, revisión, materia pendiente) y la
certificación junta de 1.º a 5.º, con los años de otro plantel cargados a mano
(DOC-01…08, `MAPA_DE_CALCULOS.md` §8e).

## El año escolar venezolano

- **Áreas con apreciación** (GCRP y las que el liceo marque): no llevan número y
  quedan fuera de todo promedio y de la condición. En las cuentas entre materias
  se filtra con `NOTAS_QUE_CUENTAN` (`apreciaciones.service.ts`); olvidarlo mete
  una «A» en un promedio (CUALI-*).
- **El calendario del MPPE** se ofrece al crear el año: una cuenta en
  `utils/calendario-mppe.ts` y `lib/calendario-mppe.ts` (Pascua incluida).
- **El fin del año va por pasos** (Académico → año → Cierre): faltantes,
  revisión, decisiones, año siguiente, expedientes. Las reglas en
  `promotion/reglas-del-fin-de-ano.ts`. **Ojo:** al cerrar, el alumno tiene dos
  inscripciones activas; las notas se toman de los lapsos del año que se cierra,
  no de «la inscripción activa» (CIERRE-10 salía en rojo una de cada tantas).
- **Revisión y materia pendiente las pone el profesor de la materia**; la
  pendiente va por momentos y con acta de compromiso (`materias-pendientes.service.ts`).
- **Labor social**: la anotan el admin y el profesor guía; cuenta para egresar
  según el liceo (bloquea, avisa o nada; `MAPA` §8d).

## Lo que el liceo hace en el plantel (septiembre 2026)

- **Crear una cuenta pide lo mínimo**: nombre, apellido, correo, cédula,
  contraseña, rol y sexo. Lo demás (nacimiento, teléfono, datos del Ministerio) y
  los **recaudos** de inscripción (lista del liceo, `inscripcion.service.ts`) se
  completan en el perfil. Usuarios → «les falta algo».
- **Avisos** (`avisos.service.ts`, `avisar(...)`): campana en la app, tiempo real
  y al teléfono con la app cerrada (Web Push para la PWA; FCM para la APK, que
  espera el proyecto de Firebase del dueño: `docs/APP-MOVIL.md`). En la pantalla
  bloqueada, qué y cuándo, sin detalles. `/api/avisos` y `/api/citaciones` no se
  guardan en la memoria rápida (los escribe otro).
- **Observaciones** en su panel; desde una, **citar al representante** (aviso,
  hoja impresa, ¿vino?).
- **Traslado**: hoja de notas parciales y archivo firmado (Ed25519,
  `TRASLADO_LLAVE_PRIVADA`) que otro liceo con Gestiedu importa; las notas de
  los lapsos traídos cuentan (`MAPA` §1c).
- **Matrícula** (`MAPA` §8f), **graduandos y título**, **consejo de sección**,
  **constancia de trabajo y carga horaria**, **carnet** (sin QR, decidido).
- **Comedor (PAE)**: módulo que se activa como los pagos (403 `PAE_APAGADO`),
  solo el admin, `pae.service.ts`.

## Las actividades de la clase y el plan

- **Una actividad nace en la clase que se ve**: el POST lleva `date` y, si ese
  día no tiene sesión, se crea. Antes, un día sin asistencia guardada la dejaba
  sin sesión, fechada por su creación en UTC, y no salía en ninguna lista
  aunque el servidor respondía 201 (`utils/actividad-del-dia.ts`, ACTDIA-*).
  Ninguna prueba pulsaba «Nueva Actividad»: ahora CLASE-UI-06/07.
- **Suma a la evaluación del plan que cubre su semana** (la de su entrega si la
  tiene), también si está unida a varias semanas (`__uniones` de la actividad o
  los puntos, no `endWeekNumber`); con varias, elige el profesor; sin ninguna,
  se avisa que no suma. Guardar el plan quitando una evaluación con notas: 409
  (`evaluacion-de-la-semana.service.ts`, SEMEVAL-*, `MAPA` §1a).
- **Instrumentos de evaluación** (lista de cotejo, escala, rúbrica, por puntos):
  se arman en cada evaluación del plan; en la clase, «Dar nota» cambia la tabla
  de alumnos a una columna por indicador, con una barra que se arrastra de 0
  a lo que vale (la portada mal hecha, 1 de 2; en la escala, el nivel) y la nota va a `scores`. La actividad guarda su copia; con instrumento no hay nota
  a mano salvo «otra forma». **Quitar el instrumento lo quita de todas sus
  actividades**, también de las calificadas: la nota se queda y se cambia a
  mano (INSTR-11). Cada criterio lleva su descripción. La hoja de
  instrumentos sale **con las notas** (`?enBlanco=1`, vacía) y uno solo con
  `?evaluacion=`. El alumno ve SU desglose. Una cuenta copiada en
  `utils/instrumentos.ts` y `lib/instrumentos.ts` (INSTR-*, `MAPA` §1a-bis).

## Los documentos salen limpios

Toda pantalla de papel está en `lib/documentos.ts` (`esDocumento`) y se ve **sin
el armazón de la app**; una prueba exige que la que imprime esté en la lista. El
corte `lateral:` se mide contra el ancho del PAPEL: dentro del armazón, en carta
se imprimía la cabecera del teléfono y la barra de abajo en cada hoja. El
`@media print` de `globals.css` declara las cajas del margen vacías (Chrome 131+
quita así la fecha y la dirección del navegador). Para hojas nuevas,
`HojaImprimible` (papel, «Página N de M», nombre del PDF). En la APK imprime
`ImprimirPlugin.java` (`lib/imprimir.ts`). Se comprueba con DOC-LIMPIO-* a 703 px
(el ancho de una carta), no a 1280. El plan de evaluación, el acta de
socialización y los instrumentos tienen su propia hoja.

## Dos ayudas del servidor

- **`utils/error-claro.ts`**: el manejador global cambia los 4xx por uno
  genérico; `responderErrorClaro` deja pasar el mensaje y el código propios
  (`MARCADOR_DESCONOCIDO`, `SIN_PROSECUCION`…) para que la pantalla diga qué pasó.
- **`npx tsx src/scripts/deriva-del-esquema.ts`**: las migraciones de los liceos
  se escriben a mano; esto compara la base migrada con `schema.prisma` y enseña
  el SQL que faltaría. PostgreSQL corta los nombres a 63 letras: un índice de
  nombre largo sale como deriva. Queda una deriva vieja, no de estas funciones:
  `institutes.email` y `users.status`/`archivedAt`. Con un liceo de la base
  compartida pasa `DATABASE_URL` con SU esquema: si no, salía TODO como deriva.
- **Un liceo nuevo nace migrado, nunca empujado** (`migrate deploy`, no
  `db push`): sin `_prisma_migrations`, la migración siguiente le fallaba para
  siempre (BASE-COMP-05).

## Carga diferida

Lo que no se ve al abrir una pantalla —un modal, una pestaña, la gráfica del
alumno, el escáner del QR— baja al abrirlo: `diferido(() => import(...))`
(`components/common/Diferido.tsx`). Dos reglas:

- **El modal se pinta solo abierto**: `{abierto && <Modal isOpen … />}`. Un
  diferido que se pinta cerrado (aunque devuelva `null`) baja igual.
- **Sin señal**: lo abierto alguna vez con internet está guardado (`sw.js`
  guarda todo `/_next/static/`) y se ve igual; lo que no, dice que no está
  guardado y ofrece reintentar, sin romper la pantalla (APAGADO-03).

Además, fuera del armazón común: los globos (cada `BotonIcono` trae el suyo),
la ventana de «¿seguro?» (baja la primera vez que se pregunta), el tiempo real
(`socket.io-client`, solo con sesión; si no se puede bajar, se pregunta al
servidor para que salga el aviso de sin conexión) y `qrcode`. Las fotos de
perfil se piden cuando el avatar llega a la pantalla.

Se mide con `tests/e2e/medir-carga.spec.ts` (CARGA-01, contra la web
compilada; la cabecera dice cómo). Septiembre 2026, javascript a ejecutar la
primera vez: login 805 → 647 KB, Inicio del personal y del representante
1455 → 981 KB, sección 1194 → 1013 KB. El Inicio del alumno sigue en 1402 KB:
su gráfica (recharts) sí se ve.

## Las pantallas no se dejan enmarcar

`next.config.js` pone en TODAS las rutas `X-Frame-Options: DENY`,
`frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`
(cámara y ubicación solo para la app), y quita `X-Powered-By`. La API ya las
traía (helmet); las pantallas, ninguna: el login se podía meter en un marco
invisible de otra página (SEG-WEB-01/02). Y el profesor, al buscar alumnos para
una observación, encuentra solo a los de sus secciones.

## El icono de la pestaña

`/icono-de-pestana` (`app/icono-de-pestana/route.ts`) sirve el favicon del
liceo de la petición (el de `?liceo`, la cabecera, la cookie o el subdominio) o,
si no tiene, el genérico. El `/favicon.svg` que declaraba el armazón le ganaba
siempre al logo que subía el liceo (FAV-01/02).

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
pulgar, con **Inicio en el centro** y a cada lado lo que ese rol abre cada día
(`losDeLaBarra` en `lib/el-menu.ts`): cinco para el personal (admin: Académico,
Usuarios, Horarios y Pagos, o Eventos sin pagos; profesor: Académico,
Materias, Horarios, «Mi cuenta»), tres para el alumno («Mi boleta» y «Mi
cuenta») y dos para el representante. **El calendario se quitó** (lo pidió el
liceo: el horario en vivo ya dice qué toca). Se esconde donde hay barra lateral —tableta u
ordenador, `lateral:` en `tailwind.config.js`; **un teléfono tumbado NO**, aunque
pase de 1024 px de ancho—, respeta la barra de
gestos del teléfono (`env(safe-area-inset-bottom)`) y cada botón mide 44 px de
alto. El contenido lleva `pb-28` en móvil para que la barra no tape el último
botón de la pantalla.

**Al bajar se esconde entera**, casita incluida: la de Inicio sobresale por
encima de la barra y se quedaba asomando, un medio círculo morado flotando
sobre el contenido (visto en un Motorola; MOVIL-02 lo mide).

## En el teléfono, lo que se comprueba cada vez

```bash
npm run movil            # 55 pantallas, los 4 roles, con foto de cada una
npm run movil -- --exigir   # y acaba en rojo si algo incumple
```

Seis reglas. Cada una estuvo rota en veinte o treinta pantallas a la vez, y
ninguna daba error: solo «se ve raro».

| | Qué |
|---|---|
| `ancho` | La pantalla no se sale de ancho |
| `arrastre` | Nada de dentro se arrastra de lado (tablas, rejillas, carriles) |
| `banda-arriba` | La franja del reloj está TAPADA por algo opaco |
| `banda-abajo` | Lo mismo con la barra de gestos |
| `dedo` | Lo que se pulsa mide 44 px o más, de alto y de ancho |
| `letra` | Nada por debajo de 12 px |

Y una séptima que no es de diseño sino de honradez: `sin-cargar`. Si la
pantalla seguía diciendo «Cargando…» al medirla, no se midió nada y sale
limpia — pasó, y tres pantallas cambiaron de rojo a verde entre dos tandas sin
tocar una línea.

Las reglas viven en `scripts/reglas-del-telefono.mjs` y las usan dos: la
auditoría con sus fotos y `tests/e2e/movil.spec.ts`, que se pone en rojo.

**Un carril que se arrastra de lado lleva `relative`.** Dentro, un `sr-only`
(que es `absolute`) se sale del carril y ensancha la PÁGINA: el Inicio del
alumno medía 1188 px en un teléfono de 412, salía alejado y no se podía pulsar
nada de la ventana de su clase (auditoría §58).

**No solo un teléfono de pie.** `MOVIL-03` mide también el teléfono tumbado
(844×390), la tableta (768×1024), el portátil (1366×768) y el escritorio
(1920×1080): en todos, nada se sale de ancho ni hay que arrastrar de lado; el dedo
y la letra, solo en los táctiles.

**Tres trampas del medidor, que costaron tandas enteras:**

- **`window.innerWidth` no dice cuánto mide el teléfono.** Cuando algo se sale
  de ancho, el navegador de un móvil ENSANCHA la ventana, así que
  `scrollWidth > innerWidth` da falso: el fallo se tapa a sí mismo. Se mide
  contra `visualViewport`.
- **En un ordenador `env(safe-area-inset-top)` vale 0**, así que una
  comprobación de píxeles no vería nunca lo de las bandas. Por eso la app no
  lee `env()` a pelo: lo guarda en `--zona-segura-arriba` / `--zona-segura-abajo`
  (globals.css) y la auditoría les pone el valor de un Android de verdad.
- **`animate-pulse` no significa «cargando»**: un icono que late de adorno no
  es un esqueleto. Un esqueleto es una barra ancha y sin texto.

Y tres cosas más que ya estaban y siguen valiendo:

- **La barra de abajo tapa lo último de la pantalla.** «Cerrar Sesión» quedaba
  justo debajo: se veía, pero el dedo pulsaba la barra, y había que girar el
  teléfono para salir de la sesión.
- **Salir devuelve al portal del liceo**, no a `/login` pelado, que responde
  «no existe»: lo último que veía quien cerraba sesión era un 404. La cuenta
  está en `lib/la-puerta-del-liceo.ts`, y ojo: **justo cuando hace falta, la
  cookie del liceo ya no está** —cerrar sesión se la lleva—, así que el liceo
  se apunta la primera vez que se ve.
- **De pie, las dos pantallas densas cambian de forma.** El horario y el plan
  de evaluación piden 700 y 1000 px. El corte se hace **por ancho** (700 px),
  no por «es un móvil»: así el mismo teléfono tumbado ya enseña la rejilla
  entera, y hay un botón que pide el giro (`lib/girar-la-pantalla.ts`).
  - Horario: un día cada vez, en vertical (`HorarioPorDias`).
  - Plan de evaluación: por bloques (`PlanPorBloques`). El plan no es una
    rejilla: las columnas las pone el profesor y una celda abarca varias
    semanas, así que es **una sucesión de bloques de trabajo en el tiempo**.

## Sin señal se trabaja (como WhatsApp)

Cambió el 2026-09-30 (antes era «sin señal se mira, no se toca»): en Venezuela
se va la luz y el liceo se queda sin internet. **La app no se queda nunca en
blanco**, **se baja sola** lo de cada rol (también lo que no se ha abierto,
`lib/lo-que-se-baja-solo.ts`, cada 30 min y al volver la conexión) y **se
pone al día sola** (el ayudante baja la compilación nueva en segundo plano; la
APK nueva se baja sola con wifi y pide un toque para instalarse).

**Lo hecho sin conexión queda pendiente (⏱) y sube solo al volver**
(`lib/por-enviar.ts`, `providers/EnviarLoPendiente.tsx`): la clase (asistencia,
notas, actividades, instrumento), el plan de evaluación, observaciones,
citaciones, la configuración y los eventos. Arriba, «N sin enviar»; al tocarlo,
la lista. Lo que necesita al servidor en el momento (entrar, pagos, el QR,
cierre del año, subir archivos, crear cuentas…) sigue pidiendo conexión.

Las reglas (decididas por Cristian):

- **Orden al subir**: plan → crear → cambiar → **borrar al final**.
- **Nada se aplica dos veces**: cada cambio lleva su número (`X-Cambio`,
  `plugins/cambios-sin-conexion.ts`, tabla `cambios_recibidos`).
- **Cada cambio lleva lo que se vio** (`antes`, `notasVistas`, `__visto` por
  campo en la configuración, `utils/lo-que-se-vio.ts`). Si otro lo cambió
  mientras tanto, no se pisa: **se le pregunta al que llega segundo** (409
  `CAMBIO_MIENTRAS_TANTO`).
- **Borrar una actividad a la que otro puso notas**: «¿aún quieres borrarla?».
- **Notas a una actividad ya borrada**: decide quien la borró (recuperarla con
  esas notas o no; `cambios_en_espera`, pantalla «Por decidir»).
- **El instrumento cambió mientras el profesor calificaba**: decide el admin
  («¿aún quieres la escala?»: sí borra esas notas a la papelera y avisa al
  profesor; no, se queda la lista de cotejo con sus notas).

Pruebas: SINCON-01…12 (servidor), SINCON-UI-01/06/07, DESCARGA-*, NUNCA-BLANCO-*.

**Lo guardado es de quien lo descargó.** La llave lleva el liceo y la cédula
(`lib/lo-guardado-en-el-telefono.ts`): un teléfono que se presta no enseña lo
del anterior. Al cerrar sesión se borra, y caduca a los siete días.

**El ayudante (`public/sw.js`) sigue sin guardar datos del liceo**, y el motivo
no es técnico: lo que guarda un service worker es del NAVEGADOR, no de la
persona. Ahí solo vive la cáscara —la página, el javascript y los estilos—, que
es igual para todo el mundo; y es lo que hace que la app ABRA sin internet.

**Guarda también cada pantalla que se abre, aunque se llegue sin recargar.**
Dentro de la app Next pide solo un trozo (`?_rsc=`), y la página entera no
pasaba nunca por el ayudante: se recorría todo tocando, se cerraba la app sin
señal y salía «esta pantalla no está guardada». Ahora `AyudanteDeLaApp` le
avisa (`lib/paginas-guardadas.ts`) y él la trae entera, como mucho cada 10
min; al cerrar sesión se olvidan. Y **una pantalla solo se ve sin señal si sus
datos van por `useQuery`**: lo pedido a mano no se guarda (ciclo, usuarios,
perfil y calendario salían vacíos).

El aviso sin conexión es **un icono pequeño que late** arriba a la derecha
(`AvisoSinConexion`), no una franja que tape la cabecera; al tocarlo, explica.

**«Sin internet» y «sin servidor» no son lo mismo, y el caso real es el
segundo:** el teléfono con datos y el servidor apagado. `navigator.onLine` dice
que todo va bien. La cuenta de verdad la lleva `lib/estado-del-servidor.ts`
(error de red, tiempo agotado o 502/503/504 = no contestó; un 4xx o un 500 en
JSON = contestó), y `useConexion` pregunta a `/health` cada 15 s hasta que
vuelve. Cuatro cosas que fallaban con el servidor apagado, todas medidas:

- **La sesión se cerraba** si tocaba renovarla: cualquier fallo al renovar
  mandaba al login. Ahora solo un 401/403 del servidor la cierra; y la ruta de
  renovar responde 503, no 401, cuando el servidor de datos no está.
- **Lo guardado se borraba al abrir.** Las pantallas pedían sus datos, fallaban,
  y el dato bueno quedaba «con error»; la memoria guardaba solo lo «bueno» y lo
  dejaba fuera. Ahora se guarda todo lo que tenga datos, y no se guarda nada
  hasta haber devuelto lo guardado (`MemoriaDelTelefono`).
- **Guardar daba un error sin motivo.** Ahora `SinConexion` trae la forma de
  una respuesta (`response.data.error`) y lo dice igual en toda pantalla.
- **La app abría en el login**, inútil sin servidor. Con sesión en el
  teléfono, va a lo guardado (`SinConexionAlEntrar`, `sin-conexion.html`).

**Con el servidor de DESARROLLO esto no se puede probar**, y no es un fallo: el
cliente de desarrollo de Next no arranca la app sin su servidor (medido: la
página sale pintada pero muerta). Para probarlo en el teléfono:
`npm run telefono:usb` (no `telefono:compilado`: por `http` a la IP de casa el
ayudante no existe, ver abajo). En el navegador: `npm run build` en `apps/web`,
`npx next start -p 3108` y `WEB_DESTINO=3108 npx playwright test servidor-apagado`
(APAGADO-01 apaga el servidor de verdad: una puerta TCP propia que se cierra).

## La huella

La huella **no entra al sistema**: abre un cajón del propio teléfono (el
almacén de claves de Android) donde ese teléfono guardó una llave, y esa llave
es la que se canjea por una sesión. **La primera vez en un teléfono se entra
siempre con correo y contraseña**; la huella es para volver a entrar.

La llave es aparte de la de la sesión, a propósito: la de la sesión rota en
cada uso y vive en una cookie que la página no puede leer, y eso no se toca.
De la nueva se guarda **solo el resumen**, se cambia en cada uso, caduca a los
60 días y se anula al cerrar sesión. Ver `services/llave-del-telefono.service.ts`
y `LLAVE-01…07`.

Solo dentro de la APK: en un navegador no hay dónde guardar algo así detrás de
una huella, y ofrecerlo sería fingir seguridad.

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
de Android listo para ESE liceo. Pone también `server.errorPath`: sin él,
Capacitor no enseña nunca `www/index.html` y sin servidor sale el error del
navegador, en inglés. La llave de firma no se genera ni se guarda
desde el repositorio: es la identidad del liceo en Google Play. Todo en
`docs/APP-MOVIL.md`.

**Una versión nueva de la APK se baja desde la propia app.** `npm run
publicar` (en `apps/movil`) sube el número, compila y deja la APK con su
huella en `APP_MOVIL_DIR`; al abrirse, la app pregunta a
`/api/app-movil/<paquete>/version` y ofrece «Descargar e instalar»: la baja
dentro, comprueba la huella y abre el instalador de Android, que exige la
misma firma (`ActualizarLaApp.tsx`, `ActualizarAppPlugin.java`). **No vale
para Google Play**: allí se actualiza por Play y sin el permiso
`REQUEST_INSTALL_PACKAGES`.

Tres cosas de la APK que el navegador no enseña nunca (medidas en el
emulador; `MainActivity.java` y `styles.xml`):

- **La franja del reloj la pinta el TEMA.** Al irse la pantalla de arranque,
  Android la repinta con lo que diga el tema y pisa lo que hiciera el código.
  El tema no decía nada: gris en claro, **negra en modo oscuro** (Motorola
  G13). Tema `Light` con `statusBarColor` y `windowLightStatusBar`.
- **`errorPath` tapaba la app guardada.** Sin servidor, Android avisa de error
  en la página principal aunque el ayudante la haya servido, y Capacitor
  cargaba su pantalla de error encima. Ahora se mira qué quedó en pantalla.
- **Las cookies se escriben al disco cada 30 s.** Cerrando antes, se perdía
  la sesión. Se fuerzan al salir de la app (`onPause`).

## Probar en un teléfono de verdad

`npm run telefono` levanta los dos servidores para que los vea un móvil del
mismo wifi. No es `npm run dev` con otro nombre: `localhost` en un teléfono ES
el teléfono, y los dos servidores solo le abren la puerta a `localhost` (CORS y
`allowedDevOrigins`). Sin eso, la app sale **en blanco** y nada lo avisa.

**Por la red de casa la app no abre sin servidor, y no es un fallo de la
app:** el ayudante (`sw.js`) solo existe en `https` o en `localhost`, y
`http://192.168.1.156` no es ninguna. Para probar eso, `npm run telefono:usb`:
compila, levanta los dos servidores y hace que el `localhost` del teléfono
enchufado sea este ordenador (`adb reverse`). La APK, con
`--url=http://localhost:3000/login?slug=…`; el servidor apagado es
desenchufar el cable. En el emulador, `-- --puente-a-mano` (el puente lo pone
y lo quita `adb reverse`; si no, se vuelve a tender solo a los 3 s), y
`--dispositivo=<serie>` para no tocar otro teléfono enchufado. Pasos en
`docs/APP-MOVIL.md`.

Y `telefono:compilado` no arrancaba nunca las pantallas: el `npm run start`
que lanzaba se quedaba colgado sin abrir el puerto. Ahora se lanza Next
directamente.

**El servidor de datos también tiene que dejar pasar al teléfono.** En
desarrollo se aceptan los orígenes de las tres redes privadas (192.168.x.x,
10.x.x.x, 172.16–31.x.x) además de `localhost`; en producción manda
`CORS_ORIGIN` y nada más. Ojo: los archivos `.env` **ganan** a las variables
del entorno (`override: true`), así que esto cuelga del modo, no del valor.

**Una dirección de red no nombra a ningún liceo.** `192.168.1.156` partido por
puntos daba cuatro trozos y el primero se leía como el liceo: «el instituto 192
no está registrado». La cuenta vive ahora en un solo sitio,
`lib/el-liceo-de-la-direccion.ts`, y estaba copiada en tres.

## El cuadro de honor (octubre 2026)

Por lapso y por ciclo completo, con **una foto cada sábado** (tabla
`cuadro_de_honor`, única por alumno, alcance y fecha; la tarea se pone al día al
arrancar si el sábado no se sacó). El promedio es **el de la boleta**; la
asistencia y las observaciones, solo las del período, y una felicitación
(`POSITIVE`…) no resta. Pesos del liceo en Configuración → Académica (80/20/5
por defecto; `MAPA` §8h). El admin ve el liceo o un año; **el alumno y su
representante ven SOLO su puntaje y cuántos puestos subió** —ni su puesto ni a
nadie: el servidor no lo manda—; el profesor, 403. CUADRO-01…09, CUADRO-UI-01/02.

## El recorrido guiado (como la app rial)

El «?» de la cabecera oscurece la pantalla, ilumina **el botón de verdad** y un
globo explica qué hace, con «Atrás» y «Siguiente»; la pantalla baja sola. La
primera vez en cada pantalla se **ofrece** una sola vez. Los pasos van en
`lib/recorridos.ts` y apuntan a `data-recorrido="…"` (el título y las acciones
de `EncabezadoDePantalla` ya lo llevan); lo que ese rol no ve se salta.
**Al renombrar o quitar un botón con `data-recorrido`, RECORRIDO-01 se pone en
rojo**: es a propósito (un paso sin su marca se saltaría callado). Las pruebas
de navegador no ven la oferta (la tapa `navigator.webdriver`) salvo que pongan
`gestiedu:ofrecer-recorridos`. RECORRIDO-UI-01…04.

## Robustez (octubre 2026)

- **Azar en toda espera** (`lib/azar.ts`): vuelve la luz y cientos de teléfonos
  reintentan a la vez. Medido (`npm run medir:vuelve-la-luz`): p95 de 6–7 s
  todos juntos, 60 ms con el azar.
- **Renovar la sesión y `/health` tienen el cupo de un liceo entero** por
  dirección (un liceo sale por una sola): con el de una persona, 150 de 200
  teléfonos se quedaban con 429. Y la web reenvía la dirección al renovar; si
  no, en producción eran todos los liceos en un cupo (CUPO-REN-01).
- **429 y 503 son «ahora no», no «no se pudo»**: lo pendiente espera lo que
  pide el servidor; un 400 pasa a «no se pudo» sin atascar lo de detrás
  (SINCON-13). La base saturada responde 503, no 500 (`esUnAhoraNoDeLaBase`).
- **Teléfono lleno**: lo pendiente no se pierde callado; se tira lo que se
  vuelve a bajar y, si aun así no cabe, la pantalla lo dice (GUARDA-01).
- **Nada falla callado**: las tareas laten y el inicio del superadmin enseña su
  salud, los respaldos y el disco; los `.catch` vacíos se apuntan
  (`avisarSiFalla`). Lo que crecía sin límite se tira a diario con plazo
  configurable (MANT-*). Detalle en `docs/DESPLIEGUE.md` §10.

## Dónde se anota lo que se hace

- `docs/antigravity/` — lo que dejó Antigravity (oct. 2026): el mapa de la arquitectura,
  su plan de optimización y su traspaso. **Revisado, no es ley**: su informe decía
  «100 % en verde» y fallaban 10 pruebas; ver auditoría §64.
- `docs/AUDITORIA-FUNCIONAL.md` — auditoría funcional y el porcentaje de avance.
- `docs/MAPA_DE_CALCULOS.md` — toda regla de cálculo.
- `docs/DESPLIEGUE.md` — despliegue y operación.
- `docs/APP-MOVIL.md` — la app del teléfono: PWA y APK.
