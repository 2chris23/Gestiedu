# Gestiedu

SaaS de gestión escolar multi-liceo. Monorepo: `apps/backend` (Fastify 5 + Prisma 6 +
PostgreSQL) y `apps/web` (Next.js 16 + React 19 + Tailwind).

**Multi-tenant: una base de datos por liceo.** La BD de plataforma guarda la fila del
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
cd apps/backend && npx jest         # 849 pruebas en 101 archivos (integración + cálculo)
npm run test:e2e                    # 198 pruebas de navegador (Playwright), con los dos servidores arriba
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
`notification` (no es información del liceo).

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
pulgar, con **Inicio en el centro** y a cada lado lo que ese rol abre cada día
(`losDeLaBarra` en `lib/el-menu.ts`): cinco para el personal (admin: Académico,
Usuarios, Horarios y Pagos, o Calendario sin pagos; profesor: Académico,
Materias, Horarios, Calendario), tres para el alumno y el representante
(Calendario y «Mi cuenta»). Se esconde donde hay barra lateral —tableta u
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
npm run movil            # 31 pantallas, los 4 roles, con foto de cada una
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

## Sin señal se mira, no se toca

El teléfono guarda lo último que se descargó y sin conexión lo enseña, con un
aviso de que es lo de antes. Guardar, corregir o borrar siguen necesitando
internet, y se dice en el acto: se corta en `lib/axios.ts` antes de salir.

**No se deja nada «pendiente de enviar»** —que es lo que hace React Query por
defecto— porque media hora después se mandaría una nota sobre datos que
mientras tanto ha tocado otro profesor, y nadie se entera.

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

## Dónde se anota lo que se hace

- `docs/AUDITORIA-FUNCIONAL.md` — auditoría funcional y el porcentaje de avance.
- `docs/MAPA_DE_CALCULOS.md` — toda regla de cálculo.
- `docs/DESPLIEGUE.md` — despliegue y operación.
- `docs/APP-MOVIL.md` — la app del teléfono: PWA y APK.
