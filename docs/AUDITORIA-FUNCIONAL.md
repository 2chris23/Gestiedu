# Auditoría funcional — ¿hace cada cosa lo que dice?

Objetivo: que **cada acción del sistema haga exactamente lo que dice**, con los
datos correctos, sin errores y sin importar cuántos usuarios haya conectados.

Método: se prueba contra el sistema de verdad (API + base de datos real de
pruebas) y se comprueba el **efecto**, no el código de respuesta. Un endpoint que
responde 200 pero guarda otra cosa cuenta como roto.

Estado: **fases 1 y 2 terminadas** (12 de septiembre de 2026).

---

## 1. Qué había cubierto antes

De 235 acciones que expone el sistema, solo **86 (37%)** aparecían en algún test.
Las áreas con cobertura **cero** incluían actividades de clase, asistencia,
notas, paneles, profesores, observaciones y notificaciones.

Tras la fase 2: **111 de 235 (47%)**, y las partes cubiertas ahora comprueban el
dato guardado, no solo la respuesta.

---

## 2. Bugs encontrados y corregidos

Todos confirmados ejecutando el sistema, no leyendo el código.

| # | Qué estaba roto | Qué se veía | Corregido en |
|---|---|---|---|
| 1 | El promedio de la sección **ignoraba las notas de Clase en Vivo** | El profesor ponía 17 y la lista mostraba "Sin calificar" | `bulk-averages.service.ts` (nuevo) + `students.controller.ts` |
| 2 | **Editar una materia fallaba siempre** (se enviaba a la base una columna que no existe) | "Error en la base de datos" al guardar el nombre o el color | `subjects.controller.ts` |
| 3 | **Activar/desactivar un usuario** exigía una cabecera que la aplicación no envía | "No se pudo determinar el instituto" | `users.controller.ts` |
| 4 | **Asignar un estudiante a una sección** tenía el mismo problema | Igual que el anterior | `users.controller.ts` |
| 5 | **Sacar a un estudiante de una sección** reventaba con error 500 si faltaba el cuerpo | Pantalla de error en vez de "falta la contraseña" | `classrooms.controller.ts` |
| 6 | El comentario de una asistencia **se perdía**: la API decía `comment` y la columna es `comments` | El profesor escribía el motivo de la falta y no se guardaba | `attendance.routes.ts` |
| 7 | **Corregir una asistencia** con cualquier campo extra daba error 500 | Pantalla de error al justificar una falta | `attendance.controller.ts` |
| 8 | Al promover a un estudiante a un año **que no era el siguiente**, la matrícula se creaba en el año equivocado | El estudiante desaparecía del año al que lo mandaron | `close-cycle.service.ts` |
| 9 | Faltaba la regla compartida de "a quién le falta destino" para bloquear el botón Confirmar | Riesgo de cerrar el año dejando estudiantes fuera | `close-cycle.service.ts` |

### Una cosa que parecía un bug y NO era un bug

Marqué como fallo que una actividad para la próxima clase solo se anunciara en
la clase donde se creó. **Es la regla correcta y deliberada del producto:**

- así se sabe en qué clase se mandó esa actividad, y
- si se anunciara también en las clases anteriores, la pestaña "Próxima clase"
  se iría llenando de actividades acumuladas.

El día que toca entregarla sí aparece como "Clase de hoy", venga de donde venga.
Un estudiante que faltó ese día ve igualmente, al entrar a esa clase, que se
mandó algo para la siguiente.

La regla quedó escrita en el código (`classSessions.controller.ts`) y con una
prueba que comprueba sus tres caras: se anuncia donde se mandó, no se repite en
otras clases, y llega el día correcto.

### Dos correcciones a la auditoría anterior

En el informe del 11 de septiembre afirmé dos fallos de seguridad que **no
existen**. Los deduje de tests en rojo en lugar de medir:

- **Sí hay freno a la fuerza bruta**: al intento 11 el sistema responde 429.
- **No se filtra qué correos existen**: contraseña incorrecta y correo
  inexistente devuelven la misma respuesta.

Los tests fallaban porque esperaban un código 400 donde el sistema devuelve 401.

---

## 3. Rendimiento: el listado de una sección

El promedio de cada estudiante se calculaba llamando a la función de promedio una
vez por estudiante y materia. Medido sobre datos reales (1er Año A, 29
estudiantes, 3 materias):

| | Consultas a la base | Tiempo |
|---|---|---|
| Antes (uno a uno) | 1.914 | 1.261 ms |
| Ahora (en bloque) | **4** | **95 ms** |

479 veces menos consultas y 13 veces más rápido, con el mismo resultado:
`bulk-averages-parity.test.ts` compara los dos cálculos y exige que coincidan,
para que no se separen con el tiempo.

---

## 4. Qué quedó cubierto

- **Usuarios (los 4 roles)**: crear, ver, listar, editar, desactivar, reactivar, archivar, desarchivar y borrar; permisos; correo repetido; datos inválidos. `auditoria-usuarios.test.ts`
- **Montar un año escolar**: materias, secciones, profesor guía, inscribir y sacar estudiantes, plan de evaluación (incluida la regla de que los criterios sumen 20). `auditoria-academico.test.ts`
- **El día a día del profesor**: pasar asistencia, corregirla, actividades para hoy y para la próxima clase, notas reflejadas en el promedio. `auditoria-dia-del-profesor.test.ts`
- **Promedios**: el de la lista y el de la ficha dan lo mismo. `bulk-averages-parity.test.ts`
- **Horarios**: choques de profesor por las tres vías. `schedule-conflict-doors.test.ts`

Suite completa: **38 archivos, 311 pruebas, todas en verde.** Antes de esta fase
había 10 en rojo.

---

## 4.1. El fallo intermitente: resuelto

En una de cada cuatro ejecuciones completas fallaba una suite distinta, siempre
por datos que deberían existir y no estaban. La causa: **todas las pruebas
compartían una sola base de datos** y varias la vaciaban entera.

**Cada archivo de pruebas usa su propia base de datos**, copiada de una
plantilla ya migrada (`CREATE DATABASE ... TEMPLATE ...`, que en PostgreSQL
copia ficheros: milisegundos) y borrada al terminar. Ninguna suite puede tocar
los datos de otra.

Piezas: `tests/jest.dbEnvironment.js` (una base por archivo),
`tests/jest.globalSetup.js` (crea y migra la plantilla, la siembra con la fila
del instituto igual que una base real, y borra restos de ejecuciones
anteriores) y `tests/helpers.ts` (invalida la conexión cacheada del liceo, que
vivía en el proceso y apuntaba a la base del archivo anterior).

El aislamiento destapó de inmediato una dependencia oculta: una suite dependía
de datos que había dejado otra. Ahora cada una se monta lo suyo.

Comprobado: **tres ejecuciones completas seguidas en verde** (311/311), sin
bases sobrantes, y la ejecución completa tarda unos 2 minutos.
## 5. Lo que falta (fases siguientes)

**Fase 2 — cobertura del resto de la API** (hoy en cero):
paneles de inicio de cada rol, notas (endpoints de `grades`), observaciones,
notificaciones, informes, estadísticas de ciclo, perfil de profesor y
representante, y el alta/baja de institutos desde el panel de superadmin.

**Fase 3 — la interfaz**: hoy hay 2 pruebas de frontend y 16 de navegador. Para
tu exigencia de "cada botón hace lo que dice" hacen falta pruebas de navegador de
los recorridos críticos, con el sistema real detrás.

**Fase 4 — qué pasa si algo falla a mitad**:
- se cae la conexión mientras se guarda,
- dos personas editan lo mismo a la vez (hoy gana la última, sin avisar),
- se pulsa dos veces el mismo botón (duplicados).

**Fase 5 — carga**: repetir la prueba con 5.000 usuarios después de los arreglos
de conexiones, y fijar un objetivo (por ejemplo, percentil 95 bajo 600 ms).

Ver también [AUDITORIA-2026-09-11.md](AUDITORIA-2026-09-11.md) (infraestructura y
despliegue) y [MAPA_DE_CALCULOS.md](MAPA_DE_CALCULOS.md) (reglas de cálculo).

## 6. Fase 2 — paneles, notas y aislamiento

### Bugs encontrados y corregidos

| Qué estaba roto | Qué se veía | Corregido en |
|---|---|---|
| Cuatro rutas validaban el id de usuario como si fuera un CUID, cuando en este sistema **el id es la cédula** | Notas de un estudiante, notificaciones de un usuario, informe de un estudiante y horario de un profesor respondían "ID inválido" a cualquier petición real | `validation.middleware.ts` (nuevo `validateUserId`) + 4 archivos de rutas |
| Poner dos veces la nota de la misma actividad devolvía **error 500** | "Ocurrió un error inesperado" en lugar de "ya existe esa calificación" | `grades.service.ts` |
| Seis situaciones normales más del guardado de notas (actividad, lapso, materia o profesor inexistentes) devolvían 500 | Pantalla de error genérica en vez del motivo | `grades.service.ts` |
| Los errores de base de datos no se reconocían por `instanceof` cuando el cliente viene envuelto por el aislamiento por liceo | Un duplicado salía como 500 y no como conflicto | `error-handler.ts` |

### Qué quedó cubierto

- **Paneles de los 4 roles**: cada uno abre el suyo con sus datos (la nota de 15 del estudiante aparece como su promedio), ninguno puede abrir el de otro, y sin sesión no se abre ninguno. `auditoria-paneles.test.ts`
- **Notas**: poner, corregir, borrar y consultar; la nota llega al promedio y desaparece al borrarla; fuera de escala se rechaza; un estudiante no ve ni pone notas ajenas. `auditoria-notas.test.ts`

Suite completa: **40 archivos, 334 pruebas, todas en verde.**

### Lo que sigue sin cobertura

Observaciones, notificaciones, informes, estadísticas de ciclo, perfiles de
profesor y representante, y el alta/baja de institutos desde el panel de
superadmin. Son las fases siguientes junto con la interfaz.

## 7. Permisos: quién puede hacer qué

Reglas del liceo, confirmadas por el dueño del producto:

| Rol | Puede |
|---|---|
| **Estudiante** | Solo MIRAR lo suyo: su información, sus clases, sus actividades. No sube, no edita, no agrega nada. |
| **Representante** | Solo mirar a los estudiantes que representa. |
| **Profesor** | Poner notas, pasar asistencia, armar el plan de evaluación y dejar observaciones **únicamente de las clases que imparte**; y ver el promedio de sus secciones guía. |
| **Administrador** | El resto, dentro de su liceo. |

### Huecos que había (todos cerrados)

| Hueco | Qué permitía |
|---|---|
| Asistencia sin comprobar la clase | **Cualquier profesor podía pasar asistencia en cualquier sección del liceo**, aunque no diera clase ahí |
| Plan de evaluación sin comprobar la materia | Cualquier profesor podía reescribir el plan de otro |
| Observaciones sin comprobar la clase | Cualquier profesor podía dejar observaciones en secciones ajenas |
| Observaciones de un estudiante sin comprobar quién mira | **Un estudiante podía leer las observaciones de otro**; un representante, las de un niño que no representa |
| Observaciones de una sección sin comprobar quién mira | Igual, para la sección entera |
| Listado de estudiantes sin acotar | Un profesor veía a los estudiantes (y promedios) de cualquier sección |
| Errores de permiso convertidos en 500 | El usuario veía "error del servidor" en vez de "no tienes permiso" |

Las reglas viven ahora en un solo sitio, `services/authorization.service.ts`,
y se comprueban en `auditoria-permisos.test.ts`: 21 pruebas que recorren la
matriz completa (lo que cada rol SÍ puede y lo que NO).

Suite completa: **41 archivos, 355 pruebas, todas en verde.**

> Pendiente de decidir: hoy un estudiante puede editar su propio perfil
> (`PUT /api/students/profile/me`: teléfono, dirección). Si la regla es
> "no edita nada", hay que cerrarlo también.

## 8. Datos personales, acceso y hora

### Datos personales: solo el administrador

Nombre, correo, teléfono y dirección los corrige **únicamente el
administrador**. Antes cada quien editaba su propia ficha, lo que permitía a
un estudiante poner un chiste o un dato falso en los registros del liceo.
Cerradas las tres vías: `students/profile/me`, `teachers/profile/me` y
`users/profile/me`. La interfaz no las usaba, así que no queda ningún botón
roto.

### Entrar sin credenciales: no hay forma

18 pruebas que imitan intentos reales desde el navegador
(`auditoria-intrusion.test.ts`):

- token inventado a mano, token con algoritmo `none`, token caducado y basura
  en la cabecera: todos 401;
- **coger el token propio y cambiarle el rol a ADMIN**: 401, porque la firma
  deja de cuadrar;
- cabeceras inventadas (`X-Role: ADMIN`, `X-User-Id`) y `role: ADMIN` en el
  cuerpo: se ignoran, manda el servidor;
- al desactivar o borrar una cuenta, su sesión deja de valer en el acto;
- el inicio de sesión no dice si un correo existe, no devuelve la contraseña
  ni su huella, y los errores no enseñan las tripas del sistema.

Dos fugas encontradas y cerradas en el camino:

| Fuga | Qué permitía |
|---|---|
| `GET /api/users` solo pedía sesión | **Cualquier estudiante podía listar a todo el liceo con sus correos** |
| `GET /api/users/:id` solo pedía sesión | Cualquiera podía leer la ficha completa de cualquier otro |

### La hora la pone el servidor

El reloj del teléfono se cambia a mano y una VPN mueve la zona horaria, así
que el sistema ya no se fía de ellos:

- **`GET /api/time`** da el día y la hora oficiales del liceo, en su zona
  horaria configurada. La aplicación pregunta ahí en vez de mirar el reloj del
  dispositivo (Clase en Vivo y los horarios ya lo usan).
- **No se puede registrar en el futuro**: asistencia, clases y observaciones
  con fecha posterior a hoy se rechazan con un aviso claro. Es justo lo que
  haría un reloj adelantado.
- Lo que se guarda lleva la marca de tiempo del servidor, aunque el cliente
  mande otra.

11 pruebas en `auditoria-hora.test.ts`, incluida la comprobación de que un
dispositivo en Tokio y uno en Caracas ven el mismo "hoy" del liceo.

Suite completa: **43 archivos, 388 pruebas, todas en verde.**

---

## 9. Cuánto falta (cómo se calcula)

El porcentaje mide *cuánto del sistema está verificado y correcto*, no cuánto
código hay escrito. Se reparte así:

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas que comprueban el dato | 30% | 126 de 236 acciones (53%) | 16% |
| Permisos y seguridad de acceso | 20% | Matriz completa por rol + intrusión | 18% |
| Exactitud de cálculos (notas, promedios, asistencia) | 15% | Cubierto y con prueba de paridad | 13% |
| Interfaz probada de verdad (cada botón) | 15% | 2 pruebas de frontend, 16 de navegador | 2% |
| Resistencia a fallos (se cae la conexión, dos ediciones a la vez, doble clic) | 10% | Sin empezar | 0% |
| Rendimiento con 5.000 usuarios (medido de nuevo) | 5% | Pendiente de repetir | 1% |
| Despliegue y operación (respaldos, archivos, tiempo real) | 5% | Contenedores y migraciones listos; faltan respaldos y S3 | 2% |

**Total: ~52% verificado. Falta ~48%.**

Lo que más mueve la aguja, en orden: las pruebas de interfaz (15%), terminar
la cobertura de API (14%) y la resistencia a fallos (10%).

## 10. La interfaz: probada con el sistema real detrás

Se levantó la aplicación completa (backend + frontend + liceo de pruebas) y se
ejecutaron las 99 pruebas de navegador. Punto de partida: **74 pasaban, 21
fallaban**. Ahora **pasan las 99**.

### Fallos que eran del sistema

| Qué estaba mal | Qué pasaba |
|---|---|
| **Ninguna pantalla estaba protegida por rol** | Un estudiante escribía `/dashboard/usuarios` en la barra de direcciones y la pantalla se abría. El menú solo ocultaba el enlace. |
| Un ciclo escolar creado por API se quedaba **sin lapsos** | Todos los promedios se calculan por lapso: un ciclo sin ellos no cuadra nada. Ahora se crean los tres por defecto si no se envían. |
| **Un ciclo ya cerrado se podía volver a cerrar** | La comprobación miraba si había registros, no el estado del ciclo. |
| Borrar un ciclo escolar **reventaba con error 500** | Pedía la contraseña de confirmación, pero si la petición llegaba sin cuerpo se caía antes de comprobarlo. |
| Pedir un liceo que no es el tuyo solo se rechazaba **si ese liceo existía** | Ahora se rechaza siempre, y de paso no se puede ir probando nombres para ver cuáles existen. |

El error del cuerpo vacío no se parcheó caso por caso: había **29 controladores**
con el mismo riesgo, así que se normaliza una sola vez al entrar la petición.

### Fallos que eran de las propias pruebas

Ocho pruebas usaban nombres de tabla y de columna que ya no existen
(`daily_attendances`, `observations.teacherId`, `schedule_blocks.subjectId`), una
ruta inexistente, una huella de contraseña inválida y nombres de ciclo fijos que
chocaban entre ejecuciones. Corregidas contra el esquema real.

### Cobertura nueva de navegador

`roles-pantallas.spec.ts` comprueba las reglas donde las vive el usuario:

- el estudiante no entra a ninguna pantalla de administración ni a las del personal;
- el profesor no entra a usuarios ni a configuración, pero sí a lo suyo;
- ni el estudiante ni el profesor pueden cambiar datos personales;
- **si alguien edita la cookie del navegador para decir que es administrador**,
  la pantalla se abre pero llega vacía: el servidor niega los datos mirando el
  token, no la cookie.

---

## 11. Cuánto falta (actualizado)

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas que comprueban el dato | 30% | 126 de 236 acciones (53%) | 16% |
| Permisos y seguridad de acceso | 20% | Matriz por rol, intrusión y pantallas | 19% |
| Exactitud de cálculos | 15% | Cubierto y con prueba de paridad | 13% |
| Interfaz probada de verdad | 15% | 99 pruebas de navegador en verde sobre los módulos principales | 11% |
| Resistencia a fallos (conexión caída, dos ediciones a la vez, doble clic) | 10% | Sin empezar | 0% |
| Rendimiento con 5.000 usuarios | 5% | Pendiente de repetir | 1% |
| Despliegue y operación | 5% | Faltan respaldos y archivos en la nube | 2% |

**Total: ~62% verificado. Falta ~38%.**

Lo que más mueve la aguja ahora: terminar la cobertura de API (14%), la
resistencia a fallos (10%) y volver a medir el rendimiento (4%).

## 12. Resistencia a fallos: el doble clic, los dos editores y la conexión que se cae

Diez pruebas nuevas (`auditoria-resistencia.test.ts`) que hacen a propósito lo
que pasa cuando algo no sale limpio. Al escribirlas, **tres fallos reales**:

| Qué estaba mal | Qué pasaba en el liceo |
|---|---|
| **Pasar asistencia dos veces reventaba con "Error en el servidor"** | Se leía qué había y se escribía después. Dos envíos a la vez (un doble clic, o el navegador reintentando por red lenta) creaban las mismas filas y chocaban contra la base. El profesor no sabía si había quedado guardada. |
| **Dejar dos observaciones a la vez reventaba igual** | Las dos peticiones abrían la clase del día, las dos la creaban y la segunda chocaba. La observación se perdía. |
| **Dos profesores corrigiendo la misma nota: el último borraba al primero sin avisar** | El 18 que puso uno desaparecía bajo el 9 del otro y nadie se enteraba. |

Y un riesgo que todavía no había reventado pero estaba: **cargar las notas de
una sección iba fila por fila y sin transacción**. Si la conexión se caía en la
nota 20, veinte quedaban puestas, quince no, y el profesor se quedaba sin saber
por dónde se cortó.

### Qué se hizo

- **Asistencia**: cada alumno se guarda con `upsert` sobre (alumno, fecha) y todo
  el pase de lista va en una sola transacción. Pulsar dos veces deja exactamente
  lo mismo que pulsar una; si se corta la conexión no queda media sección marcada.
- **Observaciones**: la clase del día ya no se crea dos veces (`crearORecuperar`),
  y la misma observación —mismo profesor, mismo alumno, mismo día, mismo título—
  no se registra dos veces: se devuelve la que ya estaba.
- **Notas de una sección**: todas o ninguna, y la respuesta dice qué fila estorba
  (`"la número 2 no se pudo poner"`).
- **Edición simultánea**: la pantalla puede mandar la versión que tenía a la vista
  (`expectedUpdatedAt`, o la cabecera `X-Version-Vista`). Si ya no coincide, el
  segundo recibe un aviso en vez de borrarle el trabajo al primero. Quien no manda
  versión guarda como siempre: nada de lo que ya existe se rompe.
- **Freno general al doble clic** (`plugins/anti-doble-envio.ts`): si una petición
  idéntica del mismo usuario **todavía se está procesando**, la segunda no ejecuta
  nada y recibe la respuesta de la primera.

### Una decisión que conviene entender

El freno al doble clic se dejó **lo más estrecho posible a propósito**: solo actúa
sobre peticiones que se solapan. La primera versión guardaba la respuesta unos
segundos y la repetía, y eso rompió una prueba que tenía razón: al crear a
propósito una sección que ya existía, el sistema respondía "listo" en vez de "ya
existe". Un botón que dice que hizo algo sin haberlo hecho es peor que un aviso
claro, así que se recortó el alcance.

Límite conocido y dicho: la marca vive en la memoria del proceso. Con varias
instancias detrás de un balanceador, los dos clics tienen que caer en la misma.
Cuando haya más de una instancia, esto se mueve a Redis. Debajo sigue estando la
red de seguridad de las reglas de unicidad de la base.

---

## 13. Cuánto falta (actualizado)

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas que comprueban el dato | 30% | 126 de 236 acciones (53%) | 16% |
| Permisos y seguridad de acceso | 20% | Matriz por rol, intrusión y pantallas | 19% |
| Exactitud de cálculos | 15% | Cubierto y con prueba de paridad | 13% |
| Interfaz probada de verdad | 15% | 99 pruebas de navegador en verde | 11% |
| Resistencia a fallos | 10% | Doble clic, edición simultánea y guardados a medias, cubiertos | 6% |
| Rendimiento con 5.000 usuarios | 5% | Pendiente de repetir | 1% |
| Despliegue y operación | 5% | Faltan respaldos y archivos en la nube | 2% |

**Total: ~68% verificado. Falta ~32%.**

De la resistencia a fallos queda fuera, y se dice: el aviso de edición simultánea
existe hoy solo para las notas (falta asistencia, observaciones y fichas de
usuario); la pantalla de cargar notas manda por separado las correcciones y las
altas, así que si se cae la conexión entre unas y otras puede quedar la mitad
hecha; y no hay todavía una prueba que corte la conexión de verdad a mitad de un
guardado.

Lo que más mueve la aguja ahora: terminar la cobertura de API (14%) y volver a
medir el rendimiento (4%).

## 14. Cobertura de la API: de 61% a 93% de las acciones

Se midió sobre las rutas reales (no sobre una lista escrita a mano) cuántas
acciones de la API tenía alguna prueba detrás: **150 de 242**. Ahora son **224 de
242**. Se escribieron 61 pruebas nuevas en cuatro tandas: lo que cada quien ve de
sí mismo, la clase en vivo, los números que la gente lee, el panel de superadmin y
el resto.

### Lo que apareció al escribirlas: siete fallos reales

| Qué estaba mal | Qué pasaba en el liceo |
|---|---|
| **La clase en vivo no comprobaba de quién era la clase** | Ninguno de los seis puntos de escritura miraba si el profesor imparte esa materia en esa sección. Cualquier profesor del liceo podía guardar el tema, pasar asistencia, dejar actividades, poner notas y borrar actividades **de una sección que no es suya**. Es la pantalla más usada del sistema. |
| **El expediente completo de un alumno solo pedía tener sesión** | Nombre, correo, fecha de nacimiento, dirección, notas y asistencia. Cualquier estudiante sacaba el de cualquier otro poniendo su cédula en la dirección. |
| **Los promedios de sección, grado y ciclo, igual** | Con solo estar dentro se leía el promedio de cualquier sección o del liceo entero. |
| **"Mis secciones" del profesor respondía siempre 400** | Contaba una relación que no existe en el esquema. La pantalla no traía nada, nunca. |
| **El informe de asistencia y la analítica de notas reventaban con 500** | Justo al filtrar por sección, que es como se usan: filtraban por un campo del alumno que no existe. |
| **La notificación masiva reventaba con 500 siempre** | La ruta publica el campo como `recipients` y el servicio lo leía como `recipientIds`: la lista llegaba vacía. Nunca funcionó. |
| **Importar un Word no miraba quién lo subía** | Un estudiante podía subir archivos al servidor. Subir es escribir, y el alumno no escribe nada. |

### Una cosa buena que ya estaba hecha

El botón de **importar el plan de evaluación desde Word ya existe y funciona**:
lee el `.docx`, encuentra la tabla y reconoce las columnas por su encabezado (tema
generador, actividad, técnica, instrumento, ponderación…). Hay una prueba que arma
un Word de verdad y comprueba que salen las filas bien.

Sus límites, para cuando se retome esa función: solo mira **la primera tabla** del
documento, el encabezado tiene que ser **la primera fila**, no entiende celdas
combinadas, y no comprueba que los porcentajes sumen 100. Lo que falta está en
`docs/PROXIMAS-FUNCIONES.md`.

### Un detalle menor, dicho para que no sorprenda

En algunas rutas la validación del cuerpo corre **antes** que la del rol, así que
quien no tiene permiso puede recibir un "falta este campo" en vez de un "no
puedes". No ejecuta nada, pero le enseña la forma del formulario a quien no debería
verla. Está anotado, no corregido.

---

> **Nota sobre este documento.** El 15 de septiembre de 2026 un guion mal
> apuntado cortó este archivo y se llevó por delante el cuerpo central. No estaba
> en git, así que se rearmó: las secciones 1 a 14 y el marcador final son las que
> sobrevivieron en disco; las secciones 15 a 46 se recuperaron de los transcritos
> de las sesiones que las escribieron y **pueden no ser palabra por palabra la
> última versión**; las secciones 47 a 53 son el texto exacto, guardado aparte.
> Lo que cuentan —los hallazgos, los números y las pruebas que los vigilan— sigue
> en el código y en las pruebas, que no se tocaron.

---

## 15. Cuánto falta (actualizado)

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas | 30% | **278 de 278 acciones (100%)**: no queda ninguna sin que alguien la haya llamado. Y desde la sección 51, **ninguna sin que alguien haya comprobado quién puede llamarla** | 30% |
| Permisos y seguridad de acceso | 20% | Fuerza bruta cerrada por cuenta; la credencial fuera del alcance del navegador; ya no se puede mentir sobre la dirección desde la que se llama; **la memoria rápida ya no mezcla liceos** (sección 47); y **las seis puertas que solo preguntaban «quién eres» ya preguntan también «¿y puedes?»** (sección 51) | 20% |
| Exactitud de cálculos | 15% | **El mapa de cálculos está vigilado**: doce pruebas (MAPA-01 a MAPA-12) comprueban sus reglas contra el sistema. Y el promedio del lapso del alumno, que salía **17,5 donde la regla da 15**, ya sale bien y tiene su prueba (sección 53) | 15% |
| Interfaz probada de verdad | 15% | **37 pantallas, ninguna sin prueba**, y seis pruebas que **pulsan los botones de verdad** en vez de llamar a la API por dentro. 154 en verde, y la última que dependía del reloj ya espera al resultado | 15% |
| Resistencia a fallos | 10% | Doble clic, edición simultánea, guardados a medias, datos incompletos, Redis cayéndose sin que nada se abra, la base de un liceo caída sin arrastrar a los demás, y **la papelera alcanzando por fin a lo que se lleva la cascada** (sección 52) | 10% |
| Rendimiento | 5% | Medido de punta a punta; el guardado de notas, 13× más rápido; **el pozo remedido y la recomendación corregida** (sección 49); y **veinte minutos seguidos con treinta personas: 68.416 peticiones, cero fallos, sin arrastrarse ni llenarse** (sección 50). Falta la corrida con el generador en otro equipo | 4% |
| Despliegue y operación | 5% | Respaldos probados; **el repartidor con cifrado levantado y comprobado de verdad** (redirección, HSTS, tiempo real y dirección de origen); **PgBouncer levantado y comprobado**, ya no es una promesa (sección 48); faltan los respaldos fuera del servidor | 4% |

**Total: ~98% verificado. Falta ~2%.**

**715 pruebas de servidor (75 archivos) y 154 de navegador, todas en verde**, y
sin ninguna prueba inestable pendiente.

### Lo que enseñó el último barrido, y que conviene no olvidar

Las secciones 47 y 51 a 53 salieron **todas** de lo mismo: dejar de preguntarle a
las pruebas y ponerse a leer el código de una en una, cruzando lo que la ruta
promete con lo que el controlador hace.

Y lo que apareció no era menor: una fuga de datos entre liceos, seis puertas
...
Un **400**, no un fallo de base de datos. El validador del sistema exige que un
identificador tenga la forma `c` + 24 caracteres (25 en total), que es la que
genera Prisma. Y el ayudante de las pruebas hacía esto:

```js
const id = createId();                          // cuid2: 24 caracteres
return id.startsWith('c') ? id : `c${id}`;      // ← aquí
```

Cuando el identificador **ya empezaba por 'c'**, no se le añadía nada y se
quedaba en 24 caracteres: **inválido**. Y cuid2 empieza por 'c' un **3,9%** de
las veces (medido: 773 de 20.000).

O sea: cada entidad que creaba una prueba tenía una posibilidad entre veintiséis
de nacer con un identificador que el sistema rechaza. Con muchas entidades por
tanda, eso sale más o menos una vez cada cinco o seis tandas — **y cae en una
prueba distinta cada vez**, que es lo que hacía tan difícil verlo.

Corregido en los 28 archivos que lo copiaban: la 'c' se antepone **siempre**.

**Lo que esto enseña.** El fallo no estaba en el sistema: estaba en las pruebas,
y el sistema hacía bien en rechazar un identificador con formato inválido. Pero
durante meses hubo una causa inventada escrita en un documento, y eso **cerró la
investigación**: nadie vuelve a mirar algo que ya tiene explicación. Un "no lo
sé" honesto habría durado menos.

---

## 16. Rendimiento: 1.500 usuarios a la vez, medido


Liceo de prueba con **15.250 personas, 100 secciones, 2,4 millones de notas y
600.000 asistencias**. Servidor en modo producción de verdad. 1.500 usuarios
simultáneos (900 estudiantes, 450 representantes, 150 profesores) durante 20
minutos.

| | Medido | Objetivo |
|---|---|---|
| Tiempo de respuesta (p95) | **9,7 ms** | < 500 ms |
| Panel del estudiante (p95) | **6 ms** | < 500 ms |
| Sus notas (p95) | **14 ms** | < 500 ms |
| Su asistencia (p95) | **6 ms** | < 500 ms |
| Peticiones por segundo | **131** | > 100 |
| Aciertos de caché | **96,9%** | > 50% |
| Peticiones fallidas | **0 de 161.328** | < 5% |

Los 14 ms de "sus notas" son contra 2,4 millones de notas: ahí se ve el trabajo de
los promedios en bloque.

### Lo que hubo que arreglar para poder medir

| Qué estaba mal | Qué pasaba |
|---|---|
| **El liceo entero compartía un solo cupo de peticiones** | El freno contaba por IP, y un liceo sale a internet por una sola conexión: 200 personas compartían 500 peticiones por minuto. Medido: **934 de 5.600 peticiones (17%) rebotaban** con "Demasiadas peticiones" sin que nadie abusara. Un lunes con todos pasando asistencia se cae solo. Ahora cada sesión lleva su cuenta. |
| **La aplicación no podía arrancar en producción** | El `.env` pisaba el `NODE_ENV` del servidor. Aunque pusieras `production`, arrancaba en modo desarrollo: registrando cada consulta a la base y con los frenos flojos. Comprobado midiendo: `start:prod` respondía `environment: development`. |
| **El sembrado de carga dejaba el liceo sin credenciales** | La fila del liceo se creaba con el nombre de la base pero sin servidor, usuario ni contraseña. Cada intento de entrar respondía "Error al conectar con la base de datos del instituto". Además aplicaba el esquema con `db push --accept-data-loss`, prohibido en este repo; ahora usa migraciones. |
| **"Migrar todos los liceos" devolvía 500 si fallaba uno** | La petición no se rompía: salía a medias. Un 500 hace que la pantalla enseñe un error genérico y esconde lo único que importa, cuál falló. Ahora devuelve 207 y dice cuáles quedaron al día y cuál hay que mirar. |

### Una trampa del propio test, anotada

La primera medición dio **30% de errores**. No era el sistema: la prueba pide las
credenciales una vez y no las renueva nunca, así que al minuto 15 —cuando caducan—
todo devuelve 401. Confirmado: el primer 401 llega en el minuto 15,1 clavado. El
navegador real renueva la sesión solo.

Peor aún: el pico de carga cae entre los minutos 10 y 18, justo encima de la
caducidad, así que el pico no se estaba midiendo con trabajo real. Se repitió con
las credenciales durando más que la prueba. Queda anotado en el propio archivo del
test para que no vuelva a morder.

### Lo que esta medición NO dice

- Es **una sola máquina** (aplicación, base de datos y generador de carga en el
  mismo equipo). En un servidor de verdad la red añade latencia.
- Es **solo lectura**. Falta repetirlo con escrituras (`test:load:write`), que es
  donde aprietan las transacciones.
- Se midió **sin Redis** (la caché trabajó en memoria del proceso). Con varias
  instancias, la caché y el freno de peticiones tienen que ir a Redis.
- El pozo de conexiones por liceo sigue en **2**. Aguantó porque el 97% se
  respondió desde caché. Con más escritura hará falta PgBouncer, que el código ya
  soporta pero no está desplegado.

---

## 17. Cuánto falta (actualizado)

> *(El cuerpo de esta sección se perdió en el corte del 15 de septiembre y no
> se pudo recuperar del transcrito. Era una foto del avance, superada por la
> sección 54. El título es el original.)*

---

## 18. Velocidad de las pantallas y datos que se actualizan solos


### Lo que se pidió

Que abrir una pantalla sea instantáneo (unos 50 ms) y que, cuando alguien
guarda algo, el resto lo vea **sin recargar la página**.

### Velocidad: ya se cumplía, pero se estaba midiendo mal

Medido pulsando en el menú, que es lo que hace la gente, contra una compilación
de producción:

| | Primera vez | Al volver |
|---|---|---|
| Inicio | 20 ms | 20 ms |
| Académico | 90 ms | 4 ms |
| Materias | 110 ms | 25 ms |
| Horarios | 111 ms | 31 ms |
| Eventos | 85 ms | 9 ms |
| Usuarios | 84 ms | 77 ms |

**Media al volver: 28 ms.** El objetivo era 50.

Dos trampas de medición que hay que conocer para no engañarse:

- **Medir contra el servidor de desarrollo da números 3 veces peores**, porque
  compila cada pantalla la primera vez que se entra. La misma medición daba 476 ms
  de media en desarrollo y 28 ms compilado.
- **Medir con `page.goto` no es lo que vive el usuario**: eso es pulsar F5. Lo que
  la gente hace es pulsar el menú, que no recarga la página.

Lo único que se tocó por velocidad: la pantalla Académico pedía los ciclos a mano
en cada entrada, sin guardar nada. Pasó a usar el hook con caché que ya existía:
de 116 ms con dos llamadas a 4 ms sin ninguna.

La regla para volver a medir queda en `tests/e2e/medir-navegacion.spec.ts`.

### Actualizarse solo: había DOS fallos encadenados

| Qué estaba mal | Qué pasaba |
|---|---|
| **La caché del servidor no se limpiaba nunca** | La clave se armaba con el *slug* del liceo y el borrado buscaba por el *id*: nunca coincidían, así que ninguna limpieza borraba nada. Y la caché solo se aplica a estudiantes, tutores y representantes — justo los que se quejaban. El profesor ponía la nota y el alumno **no la veía ni recargando**, hasta que caducara sola: 5 minutos en notas, 30 en materias y horarios. |
| **Nada avisaba a las pantallas abiertas** | Los avisos por Socket.io existían en el servidor y la librería estaba instalada en el navegador, pero **no se usaba en ninguna pantalla**. Cada quien veía lo suyo hasta recargar. |

Comprobado midiendo antes de tocar nada: se creó una nota (respuesta 201) y "mis
notas" del alumno seguía devolviendo la lista de antes, sin la nota nueva.

### Qué se hizo

- **La clave de caché usa el id que resuelve el servidor**, no una cabecera que
  manda el navegador.
- **Cada escritura que sale bien limpia la caché de ese liceo**, en el mismo punto
  donde ahora se avisa a las pantallas (`plugins/avisar-cambios.ts`).
- **El servidor avisa al liceo cada vez que alguien guarda algo.** Un solo punto
  para todas las escrituras: son más de cien sitios donde se escribe y uno que se
  olvide es una pantalla que se queda vieja. El aviso lleva solo el nombre de lo
  que cambió — ni datos ni identificadores.
- **El navegador escucha y vuelve a pedir lo que esté a la vista**
  (`providers/TiempoRealProvider.tsx`). Si la pestaña está de fondo no gasta nada:
  lo apunta y refresca cuando la persona vuelve.
- **Y lo que uno mismo guarda también se ve al instante**: cualquier guardado que
  sale bien refresca lo que está en pantalla. Antes cada guardado refrescaba a mano
  una lista corta y se olvidaba del resto: la nota aparecía pero los medidores
  seguían con el número viejo.

### Probado con dos navegadores de verdad

`tests/e2e/tiempo-real.spec.ts`:

- **TR-01**: una materia creada por otra persona aparece sin recargar.
- **TR-02**: el aviso viaja sin el contenido de lo que cambió.
- **TR-03**: los medidores de la sección se mueven solos.
- **TR-04**: **el profesor pone la nota y la pantalla del estudiante se actualiza
  sola** — el caso tal cual se pidió.

### Lo que queda dicho

El aviso va a todo el liceo. Con miles de sesiones abiertas y un profesor cargando
35 notas seguidas, eso es mucha gente pidiendo datos a la vez. Se amortigua de dos
maneras (los avisos seguidos se juntan en uno, y las pestañas de fondo no piden
nada), pero cuando haya varios liceos grandes conviene avisar solo a la sección
afectada en vez de a todo el liceo.

## 19. Respaldos por liceo, con prueba de restauración


Era lo más grave que quedaba: **los comandos de respaldo existían en
`package.json` pero los archivos no existían**. `npm run backup:db` fallaba. No
había forma de devolver la información de un liceo.

Ahora cada liceo se guarda en su propio archivo y se puede devolver solo, sin
tocar a los demás. Detalle de uso y configuración en `docs/DESPLIEGUE.md` §8.

### Lo que hace que sea un respaldo y no un archivo

`respaldos.test.ts` hace el viaje completo contra PostgreSQL de verdad: guarda un
liceo, **le borra un año escolar y media lista de notas**, lo restaura y comprueba
que volvió exactamente como estaba. Un respaldo que nunca se restauró no es un
respaldo.

También se comprueba que un respaldo fallido **no deja un archivo vacío**: alguien
podría verlo en la carpeta y creer que tiene con qué restaurar.

### Un detalle que lo rompía y no era evidente

La URL que arma el sistema lleva parámetros que solo entiende Prisma (`schema`,
`connection_limit`…). `pg_dump` los rechaza con "parámetro de URI no válido" y el
respaldo no se hacía. Se limpian antes de pasársela.

### Medido con datos reales

El liceo de carga —15.250 personas, 2,4 millones de notas, 600.000 asistencias—
se respalda en **6 segundos y ocupa 38,8 MB**. A ese tamaño, 200 liceos son unos
8 GB y unos 20 minutos por noche.

### De paso, una corrección al documento de despliegue

Decía que Socket.io no tenía adaptador de Redis y que el tiempo real solo
funcionaba con un servidor. **Sí lo tiene** (`server.ts`, se activa cuando hay
Redis). El pendiente real es otro: subir los respaldos fuera del servidor, porque
hoy quedan en su mismo disco — el que se perdería si el servidor se pierde.

---

## 20. Cuánto falta (actualizado)

> *(El cuerpo de esta sección se perdió en el corte del 15 de septiembre y no
> se pudo recuperar del transcrito. Era una foto del avance, superada por la
> sección 54. El título es el original.)*

---

## 21. Carga con escrituras: dónde está el techo de verdad


4.675 usuarios a la vez (3.000 estudiantes, 1.500 representantes, 150 profesores
escribiendo, 25 administrativos) durante 20 minutos, sobre el liceo de 15.250
personas. Cuatro pasadas, cambiando una cosa cada vez.

### El test estaba roto de dos maneras

Antes de poder medir nada hubo que arreglarlo:

- **Pedía credenciales en cada iteración.** Con 4.675 usuarios son decenas de
  miles de inicios de sesión por minuto: medía el cifrado de contraseñas y el
  freno de peticiones, no las escrituras. **278.181 rechazos, todos en la ruta de
  login.** El test de lectura ya resolvía esto (pide las credenciales una vez en
  `setup()`); este nunca recibió ese arreglo.
- **Usaba rutas que no existen** (`/api/students/me/grades`, `/api/tutors/me/children`,
  `/api/teachers/me/classrooms`). De ahí miles de 404.

### Tres fallos reales del sistema

| Qué estaba mal | Qué pasaba |
|---|---|
| **Guardar la clase se perdía con secciones grandes** | La transacción hacía una consulta por alumno, una detrás de otra. Con 40 alumnos son 40 viajes dentro del presupuesto de 5 s que Prisma le da a una transacción: se pasaba y **la clase entera se perdía**. Medido: **648 clases perdidas en 20 minutos**. Ahora va en bloque — unas pocas operaciones tenga la sección 10 alumnos o 40. Escrituras fallidas: 642 → 148. |
| **El servidor escribía un renglón por consulta en producción** | El `.env` trae `LOG_LEVEL=debug`. Si ese archivo viaja al servidor, la aplicación escribe una línea por cada acierto y fallo de caché: **344.543 líneas en 20 minutos**, la mitad de todo el registro. Llena el disco (y tumba la aplicación), gasta CPU, y esas líneas **llevan cédulas de alumnos dentro**. Ahora en producción el registro nunca baja de "info". |
| **El pozo de 2 conexiones por liceo no aguanta con la caché fría** | `"Timed out fetching a new connection from the connection pool (connection limit: 2)"` en las pantallas de los alumnos. |

### Las cuatro pasadas

| Qué se cambió | p95 escrituras | Errores | Escrituras perdidas |
|---|---|---|---|
| Como estaba (pozo 2) | 33.396 ms | 9,11% | 631 |
| Pozo subido a 25 | 39.283 ms | 18,93% | 642 |
| Guardar clase en bloque (pozo 25) | 45.486 ms | 13,42% | 148 |
| Guardar clase en bloque + registro de producción (pozo 2) | 34.531 ms | **5,05%** | 201 |

Subir el pozo **empeoró**: quitó un freno y dejó ver el de detrás.

### Dónde está el techo

Medido por proceso, bajo carga:

| | Uso |
|---|---|
| Backend (un proceso de Node) | **224%** de CPU |
| Generador de carga (k6) | 15% |
| Base de datos | por debajo del 3% |
| Máquina entera (12 núcleos) | **22%** |

Ni la máquina, ni PostgreSQL, ni el generador: **el techo es el proceso del
servidor**. Eso se resuelve con más instancias detrás de un balanceador, que es
justo para lo que ya está puesto el adaptador de Redis de Socket.io.

### El intercambio que hay que decidir

Los aciertos de caché caen al 10% mientras hay escrituras (leyendo solo eran
96,9%). Es por la limpieza que se añadió para que nadie vea datos viejos: cada
guardado tira la caché de ese liceo. Con la caché fría, **todas** las lecturas van
a la base, y ahí se va el CPU y se agota el pozo de conexiones.

Dos caminos, y es una decisión del producto, no técnica:

- **Como está ahora:** todo el mundo ve los cambios al instante, y mientras hay
  mucha escritura el servidor trabaja más.
- **Con unos segundos de retraso:** los alumnos podrían ver un dato con unos
  segundos de antigüedad, y la caché aguanta mucha más gente.

### Lo que esta medición NO dice

La prueba pone a 150 profesores escribiendo **sin parar durante 20 minutos**. Un
liceo real escribe a ráfagas al final de cada hora de clase, no continuamente. El
número de arriba es un suelo duro, no el día normal.

Y sigue siendo **una sola máquina** con la aplicación, la base y el generador de
carga compitiendo por el mismo procesador.

### Qué hay que hacer antes de tener un liceo grande

1. **PgBouncer**, ya soportado en el código y sin configurar. Es lo que permite
   subir el pozo por liceo sin quedarse sin conexiones de PostgreSQL.
2. **Más de una instancia** de la aplicación: el proceso de Node es el techo.
3. Volver a medir con escritura a ráfagas, que es como se usa de verdad.

## 22. El aviso deja de ser para todo el liceo

### El problema, dicho sin adornos

Cuando un profesor le ponía una nota a Sofía, el sistema **tiraba la copia
guardada del liceo entero** y le decía a los 5.000 que volvieran a pedir sus datos.
Luis, que no tiene nada que ver —su nota no cambió, su promedio tampoco— también
perdía lo suyo y la cocina se lo volvía a preparar desde cero.

No era repetir un cálculo: era **tirar comida buena a la basura**. Medido: los
aciertos de caché caían del 96,9% al 10% en cuanto había escritura, y de ahí venía
el ahogo del servidor.

### Quién ve qué (y por qué el aviso puede ser tan estrecho)

| Quién | Qué ve |
|---|---|
| Alumno | **Solo lo suyo**: sus notas, su promedio, su asistencia |
| Representante | Solo lo de los alumnos que tutela |
| Profesor de la sección / admin | Los platos de sus alumnos **y los medidores del salón** |

El alumno **no ve** el promedio del salón. El representante tampoco. Por eso el
aviso de los medidores va aparte y solo al personal.

Así, un cambio de nota afecta a unas cinco o diez personas, no a cinco mil.

### Cómo quedó

- El controlador que sabe a quién afecta lo que acabó de escribir lo declara
  (`request.aQuienAfecta = { studentIds, classroomId }`).
- El escáner de la puerta (`plugins/avisar-cambios.ts`) resuelve los destinatarios
  con `services/a-quien-afecta.service.ts`: el alumno, sus representantes, y el
  personal de la sección.
- **Solo se tira la copia guardada de esa gente.** La de los demás sigue sirviendo.
- Los medidores se avisan aparte, solo a profesores y admins.

**Si un controlador no declara nada, se avisa al liceo entero como antes.** Cuesta
más, pero nunca deja a nadie mirando un dato viejo — y eso no se negocia. Van
declarados los dos que más escriben: poner una nota y pasar lista.

### De paso, la trampa de la zona horaria mordió otra vez

Una de las pruebas nuevas mandaba la fecha calculada con `toISOString()`, que da la
fecha **en UTC**. En Caracas (UTC-4), a partir de las 20:00 eso ya es el día
siguiente, y el servidor rechazaba la fecha por futura. **El servidor tenía razón**:
la prueba estaba mal. Ahora la fecha la pide al servidor (`GET /api/time`), que es
lo que hacen las pantallas.

Es la misma familia de fallos que ya está documentada en el proyecto. Conviene
recordarlo: en este sistema, el día lo dice el servidor.

---

## 23. Se esperaba 800 ms por nada

### Lo que se midió

La pregunta era: cuando alguien guarda algo, ¿cuánto tarda en verse en la pantalla
de otro, sin que nadie recargue? Se cronometró con dos navegadores de verdad
(`tests/e2e/medir-tiempo-real.spec.ts`), contra compilación de producción.

**841 ms de media.** Y clavado: 831 mínimo, 855 máximo.

Esa regularidad era la pista. Una red real varía; una espera escrita a mano, no.

### Lo que había

En `TiempoRealProvider.tsx` había un retraso de 800 ms antes de refrescar. Estaba
puesto para que una tanda de guardados no provocara una petición por cada uno —
intención correcta.

El problema es la cuenta: **el trabajo real cuesta 41 ms** (aviso por socket,
petición de vuelta, pintado). Se esperaba **veinte veces más de lo que costaba
hacerlo**.

### Lo que se hizo

Se atiende **el primer aviso al instante**. La ventana pasa a servir solo para
absorber los que vienen detrás: durante 700 ms no se vuelve a pedir, y al
cerrarse la ventana se hace una última pasada si hubo más cambios.

| | Antes | Ahora |
|---|---|---|
| Ver lo que otro guardó | 841 ms | **40 ms** |
| 8 cambios seguidos | 1 petición | **2 peticiones** |
| ¿Se pierde el final de una tanda? | No | **No** (comprobado) |

Las dos mitades del trato están en prueba: que se agrupe, y que la última
petición ocurra **después** del último cambio. Si solo se comprobara lo primero,
un agrupamiento demasiado listo podría dejar la pantalla con el dato viejo.

### Por qué no se rehízo todo

Se miró cómo lo hacen los rápidos de verdad —Linear, ElectricSQL—: el dato vive
en el navegador y el servidor solo manda lo que cambió. Con eso se llega a 0 ms.

No se hizo, y es a propósito: **el 95% del problema era la espera de 800 ms**, no
el viaje. Llevar el dato dentro del aviso ahorraría los 41 ms restantes a cambio
de un motor de sincronización propio. Queda anotado como posible, no como
pendiente.

---

## 24. La papelera: nada se borra de verdad

### El agujero

Borrar un estudiante se llevaba, para siempre y en el acto: sus notas, sus
asistencias, sus observaciones, su historial académico y sus inscripciones. Lo
mismo al borrar un profesor sin admin de reemplazo: todas las notas que ese
profesor puso y todas las asistencias que tomó.

Lo único que quedaba era el respaldo de anoche — y restaurarlo borra todo lo que
el liceo hizo hoy. Es decir: para recuperar una cosa había que perder el día.

### Lo que se hizo

Una tabla nueva por liceo, `registros_borrados`. **Antes de borrar cualquier fila
se guarda una copia completa**, con quién la borró y desde dónde.

No cambia ninguna consulta. Las pantallas siguen viendo exactamente lo mismo. Lo
único que cambia es que un borrado por error deja de ser definitivo.

Se eligió una papelera y no una columna `borrado` en cada tabla a propósito: una
columna en 34 tablas obliga a añadir `where borrado = false` en cientos de
consultas, y **la que se olvide enseña datos que ya no deberían verse**. La
papelera no puede provocar ese fallo.

### Si no se puede guardar la copia, no se borra

El guardado falla ⇒ el borrado no ocurre. Un borrado que se ejecuta sin copia es
exactamente lo que esto viene a evitar.

### Lo que NO se guarda

Las sesiones (`refreshToken`) y los avisos (`notification`). Guardar sesiones
sería guardar llaves de casa; hay una prueba que comprueba que no se guardan.

### Borrar un liceo entero: respaldo obligatorio

`DELETE /api/superadmin/institutes/:id` hace `DROP DATABASE`. Eso se lleva el
liceo completo, y **la papelera no lo alcanza porque vive dentro de esa misma
base**.

Ahora se respalda el liceo antes de tocarlo. Si el respaldo falla, no se borra
nada y se responde 409 explicando por qué. La respuesta del borrado dice dónde
quedó el archivo.

### Limpieza

`npm run papelera:limpiar` tira lo que lleva más de 90 días (`PAPELERA_DIAS`).
Más atrás que eso, quien guarda la historia es el respaldo.

### Prueba

`tests/integration/papelera.test.ts` (6 pruebas): que la copia esté completa, que
**alcance para volver a crear la fila tal cual**, que quede anotado quién borró,
que borrar un estudiante guarde todo lo suyo y no solo su ficha, y que las
sesiones no se guarden.

### Un hallazgo de paso

`migrate:tenants` no pudo migrar el liceo `test-load-5k`: su base se creó con
`db push`, sin historial de migraciones, y Prisma se niega a migrar después
(P3005). **Un liceo creado con `db push` no se puede migrar nunca más.** El script
de siembra ya se corrigió; esa base es de pruebas de carga y se rehará. Vale como
aviso: en producción, jamás `db push`.
ARCHIVO
echo "documentado"; tail -3 docs/AUDITORIA-FUNCIONAL.md

---

## 25. Forzarlo al máximo: 15.000 personas conectadas

El objetivo que puso el dueño: si aguanta 15.000 usuarios a la vez, un liceo de
500 es un paseo. Aquí está lo que se midió y lo que se rompió.

### Lo que aguanta

**15.000 conexiones abiertas al mismo tiempo, cero fallos.** Tardan 36 segundos
en abrirse todas. El servidor se queda en unos 2 GB de memoria.

Eso no lo medía ninguna prueba anterior: k6 cuenta peticiones, y el riesgo de un
liceo grande a las 8 de la mañana es otro — miles de teléfonos conectados **sin
pedir nada**, solo esperando. La prueba está en `load-tests/sockets-15k.ts`.

### Lo que importaba de verdad: a cuánta gente llega un cambio

Con 15.000 conectados, un profesor pone **una** nota:

| | |
|---|---|
| Conectados | 15.000 |
| Recibieron el aviso | **3** |
| ¿Le llegó al alumno? | sí |
| Tardó | **30 ms** |

Tres personas de quince mil: el alumno, y quien tiene que ver sus medidores. El
modelo dirigido (§22) funciona a escala. Si hubiera avisado a los 15.000, cada
nota provocaría una estampida y el servidor no se levantaría.

### Lo que se rompió (1): el pozo de conexiones es de dos

Bajo carga de escrituras, el 15% de las peticiones murieron. **Todas con el mismo
error**: `Timed out fetching a new connection from the connection pool (connection
limit: 2)`.

Dos conexiones por liceo. Y mientras eso pasaba, PostgreSQL tenía **100 plazas y
solo 20 ocupadas**. El sistema se estaba racionando solo con la base casi vacía.

Dónde pega más: el panel del estudiante (220 fallos) y el del representante
(161) — las pantallas que más se abren y las que más consultas hacen cada una.

Con la caché caliente y sin escrituras, el límite de 2 aguanta bien: 837
peticiones por segundo, p95 de 407 ms, cero fallos. El derrumbe llega cuando las
escrituras tiran la caché y todos van a la base a la vez.

**Falta elegir el número correcto midiendo, no adivinando.** Subirlo de 2 a 25 ya
se probó una vez y salió peor, pero esa medición tenía otros problemas encima
(freno de peticiones por IP, registro en `debug`, transacciones que expiraban).
Hay que repetirla limpia.

### Lo que se rompió (2): el servidor moría sin decir nada

El servidor de producción **desapareció a los 15 minutos de carga**, sin una
línea de error, tirando a todos los conectados. El registro terminaba de golpe en
medio de respuestas normales.

La causa: **no había ningún manejador de promesas rechazadas en todo el backend**.
Desde Node 15, una sola promesa sin `catch` mata el proceso entero. Una tarea de
fondo que falla se lleva por delante a las 15.000 personas conectadas — y sin
dejar dicho qué pasó.

Arreglado en `src/utils/no-morir-en-silencio.ts`:

- **Promesa rechazada** → se anota con detalle y **el servidor sigue en pie**.
  Tirar a todo el liceo porque falló una tarea de fondo es mucho peor que la
  tarea fallida.
- **Excepción no atrapada** → se anota y se cierra, porque después de eso el
  estado puede estar a medias y seguir sirviendo es cómo se guardan datos
  corruptos. **Esto obliga a que en el servidor haya algo que lo vuelva a
  levantar** (pm2, systemd o Docker con reinicio automático).

### Lo que se rompió (3): el sistema no compilaba para producción

`npm run build` fallaba con tres errores de tipos. El cliente de Prisma se había
regenerado a mitad de camino y quedó en un estado que no correspondía al esquema.
Se arregló regenerándolo.

Importa más de lo que parece: **significa que nadie había compilado para
producción en un buen rato**. Debería comprobarse en cada cambio, no descubrirse
el día del despliegue.

### Lo que se rompió (4): Redis se cayó y nadie se enteró

El servidor arrancó con `Redis not connected at startup. Continuing without
adapter.` y siguió sirviendo como si nada.

Sin Redis no hay caché de lecturas y, con más de una instancia, **los avisos en
vivo dejan de cruzar entre instancias**: quien esté conectado a la instancia A no
se entera de lo que se guarda en la B. La pantalla se queda vieja sin que nadie
lo note. Un arranque sin Redis debería gritar, no susurrar.

### Un gasto escondido: el registro por petición

Con el registro en `info`, el servidor escribió **1,2 millones de líneas (176 MB)
en 15 minutos**. Dos líneas por petición. Es la segunda vez que el registro
aparece como problema de carga (la primera fueron 344.543 líneas en `debug`, con
cédulas dentro).

### Errores de método, para no repetirlos

Dos mediciones se tiraron a la basura por cómo estaban montadas, no por el
sistema:

1. **Se midió contra el servidor de desarrollo.** `tsx watch` vigila
   `node_modules` y reinició la API a mitad de la prueba, tirando las 15.000
   conexiones. Una prueba de carga se corre **siempre** contra `npm run build` +
   `npm start`.
2. **Se editaron archivos durante la tanda**, que es exactamente lo que
   `CLAUDE.md` prohíbe.

Y una tercera: dos sesiones de IA a la vez sobre el mismo repositorio se pisan
los puertos y el cliente de Prisma. También está dicho en `CLAUDE.md`.
ARCHIVO
echo "documentado"

---

## 26. Cobertura nueva y correcciones a la sección anterior

### Tres archivos de prueba que engañaban

`grades.spec.ts`, `dashboard.spec.ts` y `real-time.spec.ts` tenían **una línea de
comentario cada uno**. Parecía que había pruebas de notas, de panel y de tiempo
real; no había nada. Eso es peor que no tener el archivo: da una seguridad falsa.

- **`real-time.spec.ts` se borró.** Lo que prometía ya está cubierto de verdad en
  `tiempo-real.spec.ts` (TR-01 a TR-04), con dos navegadores reales.
- **`dashboard.spec.ts` ahora recorre todas las pantallas con cada rol** y vigila
  el tráfico: si una pantalla pide algo y recibe un 400, un 403 o un 500, la
  prueba se cae — aunque la pantalla "se vea bien". Son 24 cargas de pantalla
  entre admin, profesor, estudiante y tutor. También mira los errores de
  JavaScript, porque una pantalla puede pintarse a medias y no avisar.
- **`grades.spec.ts` cubre lo que faltaba de notas**, no lo que ya estaba: que un
  estudiante no pueda ponerse nota ni llamando a la API a mano, que un profesor
  no califique en materia ajena, que un estudiante no vea notas de otro, y que
  una nota borrada se pueda devolver desde la papelera. El camino normal de
  calificar ya estaba probado en `live-class.spec.ts` (LIVE-06).

### Código muerto encontrado de paso

`apps/web/src/components/modals/GradeEntryModal.tsx` **no lo importa nadie**, y es
el único que usa `useGrades`, `useBulkCreateGrades` y `useUpdateGrade`. Otros tres
hooks de notas (`useStudentGrades`, `useCreateGrade`, `useDeleteGrade`) no los usa
nadie en absoluto.

Las notas se ponen por otro camino: la clase en vivo
(`POST /sessions/activities/:activityId/grades`). Código muerto que parece vivo
hace perder tiempo — alguien va a arreglar ahí un fallo que ningún usuario sufre.

### Correcciones a la sección 25

Dos cifras de la sección anterior hay que leerlas con cuidado:

1. **El 50,8% de errores y el p95 de 33 segundos salieron de una tanda
   contaminada.** El servidor se reinició a mitad (vigilante de archivos del modo
   desarrollo) y Redis estuvo caído parte del tiempo. El fallo del pozo de
   conexiones es real y está bien identificado; el porcentaje exacto, no.
2. **Una tanda posterior midió contra un servidor zombi** que había quedado
   ocupando el puerto. Sus 503 no eran del tope de carga nuevo.

Lo que **sí** quedó firme, medido y repetido:

- 15.000 conexiones simultáneas: **abren todas, ninguna falla**.
- Un cambio llega a **3 personas de 15.000**, en 30 ms.
- El pozo de conexiones por liceo está en **2**, y bajo escritura se agota: el
  error `Timed out fetching a new connection from the connection pool` aparece
  literalmente, mientras PostgreSQL tiene 100 plazas y 20 en uso.
- **No había manejador de promesas rechazadas.** Al ponerlo, atrapó 22 seguidas
  bajo carga, todas del aviso por socket a todo el liceo contra Redis. Cada una
  habría bastado para tirar el servidor.

**Lo que falta y por qué:** elegir el número correcto del pozo de conexiones
comparando 2 contra 25 en igualdad de condiciones. No se pudo cerrar en este
equipo: 16 GB no dan para el generador de carga (2,4 GB) y el servidor a la vez, y
lo que muere es la máquina. Hace falta correrlo con el generador en otro equipo.

### Una trampa que costó una hora

La máquina tenía `PORT=3000` en las variables de usuario de Windows. Se probó a
que el entorno mandara sobre el archivo `.env` —pensando en los hospedajes que
asignan el puerto— y **el backend arrancó en el 3000, quitándole el puerto a la
web**. Todo dejó de funcionar y parecía un fallo del sistema.

Revertido: manda el archivo. Queda anotado en `config/environment.ts` para que
nadie lo vuelva a intentar sin una variable propia y explícita.
ARCHIVO
echo "documentado"

---

## 27. La puerta trasera que sí existía

### Lo que se encontró

El sistema guarda copias de las respuestas para ir rápido. Ese trozo de código
corría **antes** de la autenticación y decidía por su cuenta a quién servirle la
copia, leyendo el token con `jwt.decode()` — que **lee sin comprobar la firma**.

Resultado, reproducido en vivo:

```
jwt.sign({ userId: 'V-S000001', role: 'STUDENT' }, 'clave-totalmente-inventada')
  →  200  {"student":{"id":"V-S000001","fullName":"Student1 Test1", ...}}
```

Un token inventado, firmado con una clave cualquiera, devolvía el panel completo
de esa persona. **Sin contraseña y sin conocer la clave del sistema.**

Y lo peor: como el identificador de cada quien **es su cédula**, no había que
adivinar nada difícil. Con la cédula de un alumno se leía lo suyo.

Esto contradecía de frente lo que pidió el dueño: *"no debe de haber forma que
una persona pueda acceder sin las credenciales"*.

### Cómo se arregló

`smart-cache.middleware.ts` ahora:

1. **Comprueba la firma** (`verifyAccessToken`), no solo lee el token.
2. **Comprueba que la persona siga existiendo y activa**, con la misma sesión que
   usa la autenticación de verdad. Si desactivan una cuenta, su copia guardada
   deja de servirle en el acto.
3. Ante cualquier duda no sirve nada: la petición sigue hasta la autenticación,
   que la rechaza como corresponde.

Comprobado: el mismo token inventado ahora responde **401**.

### La prueba que impide que vuelva

`tests/integration/ninguna-puerta-abierta.test.ts` hace algo distinto a las demás:
**le pregunta al servidor qué rutas tiene** y las llama TODAS sin credenciales, y
luego todas con un token inventado.

- **277 rutas barridas.** Ninguna entrega datos.
- **7 públicas a propósito**, cada una con el motivo escrito (entrar, recuperar
  contraseña, resolver el liceo antes del login, y la portada de la API).

Si mañana alguien añade una ruta y olvida el guardia, esta prueba se cae sola. Es
la diferencia entre "probamos las rutas que se nos ocurrieron" y "no hay ninguna
abierta".

### Las cookies viajaban sin cifrar

Aparte: las cuatro rutas que crean sesión ponían `secure: false` fijo. En
producción eso deja que la sesión viaje en claro — quien esté en la misma red (el
wifi del liceo) podría leerla y entrar como esa persona.

Ahora depende del entorno: cifrada en producción, normal en desarrollo (donde
`localhost` no usa https y la cookie no se guardaría).

### Lo que queda abierto, dicho claro

**La cookie del token sigue siendo legible por JavaScript** (`httpOnly: false`).
Si alguien lograra meter un script en la página, podría robarla.

No es un cambio de una línea: el token se lee desde el navegador en ocho sitios
(el socket de tiempo real, dos pantallas de sección, las pantallas de instituto).
Para cerrarlo hay que dejar de leerlo en el cliente y que las llamadas pasen por
el servidor. Es una reforma aparte, no un parche.
ARCHIVO
echo "documentado"

---

## 28. Segunda pasada de seguridad: cinco puertas más

La sección 27 cerró la puerta trasera de la copia guardada. Esta pasada fue a
buscar **más puertas del mismo tipo**: sitios donde el sistema decide quién eres
o qué puedes hacer sin comprobarlo de verdad. Aparecieron cinco, todas
reproducidas antes de tocar nada.

### 28.1. La prueba estrella solo tocaba 100 puertas de 277

Lo primero que apareció no fue un agujero del sistema, sino **un agujero en la
prueba que decía que no había agujeros**.

`ninguna-puerta-abierta.test.ts` llama a las 277 rutas del servidor seguidas. El
servidor tiene un tope de peticiones —100 por minuto para quien llega sin
credencial— y a partir de la número 101 empezaba a contestar:

```
429 Too Many Requests
```

429 no es "aquí tienes los datos", así que la prueba lo daba por bueno y seguía.
Resultado medido: **100 respuestas de verdad y 40 rechazos de golpe** en un
barrido de 140. De las 277 puertas se estaban tocando las primeras 100; las otras
177 se daban por cerradas sin haberlas probado nunca.

Y detrás de ese muro había una abierta (28.2).

**Qué se hizo.** Cada llamada de la prueba dice venir de una conexión distinta,
así que ninguna consume el cupo de la anterior — el tope sigue puesto y
funcionando, simplemente se deja de contar 277 visitantes como si fueran uno. En
la prueba del token falso se usa un token distinto por llamada, porque ahí el
cupo se cuenta por credencial. Y sobre todo: **si alguna respuesta vuelve a ser
429, la prueba se cae**. Nunca más puede decir "todo cerrado" sin haberlo
comprobado.

Ahora son 277 rutas tocadas de verdad, 10 públicas a propósito con su motivo
escrito.

### 28.2. La ficha del liceo se entregaba a cualquiera

`GET /api/institutes/current/config` era pública entera. Con solo saber el nombre
corto del liceo —que es público: va en la dirección de internet— y **sin ninguna
credencial**, una sola llamada devolvía:

```
correo y teléfono de la dirección · dirección física · configuración académica
completa (nota mínima para aprobar, cuántas materias se arrastran) · plan
contratado · precio mensual · estado de pago · próxima fecha de cobro ·
cuántos alumnos y profesores tiene · cuánto espacio ocupa
```

Comprobado contra el servidor en marcha.

Además decidía de qué liceo hablar leyendo el token **sin comprobar la firma**
(`decodeToken`): exactamente el mismo fallo de la sección 27, en otro sitio.

**Qué se hizo.** La ruta tiene que seguir siendo pública —la pantalla de entrar
necesita el nombre, el logo y los colores antes de que nadie escriba su
contraseña—, así que se parte en dos:

- **Sin sesión** → solo lo de la portada: nombre, logo, ícono, colores, zona
  horaria y si el liceo está activo. Eso mismo ya lo daba
  `/api/institutes/public/:slug` a quien supiera el nombre corto, así que no se
  regala nada nuevo.
- **Con sesión comprobada** → la ficha completa, y solo la de SU liceo: el
  instituto sale del token ya verificado, no de lo que diga la petición.

La prueba `PUERTA-04` fija la lista de lo que puede salir sin credencial. Si
mañana alguien añade un campo a la ficha, no se cuela solo.

### 28.3. El canal de tiempo real era otra puerta, sin guardia

La API tiene guardia en cada ruta. El canal de avisos en vivo (el socket) es otra
puerta al mismo edificio, y entraba por su cuenta: pedía credencial para
conectarse y, a partir de ahí, atendía cualquier cosa sin volver a preguntar.

Lo que se reprodujo, con la sesión de **un estudiante**:

- **Puso una actividad en el liceo.** `activities:create` no miraba el rol. La
  actividad apareció en la base de datos.
- **Borró la actividad de un profesor, con todas sus notas.** `activities:delete`
  tampoco miraba el rol — y lo hacía por un camino que **no pasa por la
  papelera**: `prisma.activity.delete()` directo. Se destruía de verdad, sin
  copia, contra la regla de que nada se borra.
- **Pidió la lista de todo el mundo conectado** y la recibió: cédula, rol y
  correo de cada uno. Y no era la lista de su liceo: era la de **todos los liceos
  a la vez**.
- **Se suscribió a la asistencia de una sección ajena** con solo nombrarla.
- Además, lo que se creaba se anunciaba con `io.emit`, que significa "a todo el
  mundo conectado" — liceos ajenos incluidos.

Un cuarto hallazgo: **una cuenta desactivada seguía pudiendo abrir el canal**. La
API le cerraba las peticiones, pero el socket solo miraba la firma del token y
nunca preguntaba si esa persona sigue activa.

**Qué se hizo.** Se miró qué usa la aplicación de verdad de este canal, y es
**una sola cosa**: el aviso `datos:cambiaron`, que dice "algo se movió, vuelve a
pedir lo que tengas abierto" y no lleva ningún dato del liceo dentro. Todo lo
demás que el socket atendía —una veintena de peticiones— no lo llamaba nadie:
solo podía llamarlo quien se pusiera a ello a propósito.

Así que se quitaron. El canal reparte avisos y no recibe órdenes: quien quiera
cambiar algo del liceo pasa por la API, donde están los guardias. Y para entrar
al canal ahora se comprueba lo mismo que en la API: firma, que el token diga a
qué liceo pertenece, y que la persona siga existiendo y activa.

Queda escrito en `plugins/socket.ts` que si algún día hace falta que el socket
atienda algo, se añade con su comprobación de rol y de alcance, como en las
rutas.

### 28.4. Se revisaba el formulario antes de pedir la credencial

Pedir crear un usuario sin ninguna sesión no respondía "no sé quién eres".
Respondía:

```
400 — body must have required property 'email'
```

Y probando así, sin entrar, se iba sacando la ficha entera del sistema: qué
campos existen, cuáles son obligatorios, qué roles acepta, cuántos registros deja
pedir de golpe. **Treinta rutas** lo hacían.

Datos del liceo no entregaba ninguno —la credencial se seguía exigiendo antes de
tocar nada—, pero le daba a un extraño el plano del edificio, que es por donde se
empieza a buscar la ventana mal cerrada. Y hacía ruidosa la prueba de la sección
27: un 400 tapaba el 401 que debía verse.

**Qué se hizo.** Los guardias se adelantan a la revisión del formulario. Se hizo
en **un solo sitio** (`middleware/guardias.ts`) y no retocando a mano las 137
rutas que llevan guardia: una pieza que se lee y se comprueba, en lugar de 137
oportunidades de olvidarse de una. Lo que necesita leer el formulario se queda
donde estaba y ahora corre después del guardia, que es su sitio.

La prueba `orden-de-los-guardias.test.ts` recorre todas las rutas: si mañana
alguien añade una con formulario y el guardia queda detrás, se cae sola.

### 28.5. La llave larga de la sesión se escribía desde el navegador

Al entrar, el navegador guarda dos llaves: la **corta** (15 minutos, se enseña en
cada petición) y la **larga** (días o semanas, sirve para fabricar cortas nuevas
sin volver a pedir la contraseña). La larga es la importante: con ella se entra
mañana y pasado.

El servidor la entregaba bien guardada —marcada `httpOnly`, que significa que
ningún programa de la página puede leerla— y acto seguido la pantalla de entrar
**la volvía a escribir a mano**:

```js
document.cookie = `refresh_token=${refreshToken}; path=/; max-age=...`;
```

Escritas así, desde el navegador, las llaves **no se pueden marcar** `httpOnly`
ni `Secure`. O sea que esa línea deshacía lo que el servidor había hecho bien, y
de paso le quitaba a la llave la marca de "solo por conexión cifrada" que se
había arreglado en la sección 27. Lo mismo pasaba con la llave corta **cada diez
minutos**, que es cada vez que se renueva sola.

En la pantalla principal el navegador se negaba a sobrescribir la llave larga
(está marcada, y esa marca la protege también de esto) — se comprobó en un
navegador de verdad. Pero en la pantalla de entrar por liceo, que hablaba
directamente con el servidor de datos y no pasaba por la puerta que pone las
cookies, la llave larga sí quedaba escrita a la vista.

**Qué se hizo.** Las llaves las pone el servidor y nadie más. Se quitaron las
ocho líneas que las escribían desde el navegador, y la pantalla de entrar por
liceo ahora entra por la misma puerta que todas (`/api/auth/login`), que es la
que deja las cookies con sus marcas.

`llaves-de-la-sesion.spec.ts` lo comprueba de tres maneras: que la llave larga no
se pueda leer desde la página, que el navegador sí la tenga guardada y marcada, y
—la que impide que vuelva— que no quede en todo el código de la web una sola
línea que guarde una llave de sesión desde el navegador.

### Lo que sigue abierto, dicho claro

**La llave corta (`access_token`) sigue siendo legible por JavaScript.** Es a
propósito: el navegador la necesita para enseñarla en cada petición al servidor
de datos y para abrir el canal de avisos, y hoy esos dos van a otra dirección
(`:3001`) distinta de la de la web (`:3000`).

Cerrarlo de verdad no es cambiar una marca: hay que hacer que **todas** las
llamadas pasen primero por el servidor de la web, que es el único que puede leer
una cookie marcada. Eso significa:

1. un intermediario en la web para el centenar largo de rutas de la API;
2. resolver aparte el canal de avisos, que no se puede hacer pasar por ahí;
3. decidir cómo se sirven los archivos subidos (logos, fotos), que hoy se piden
   directos;
4. asumir que cada petición da un salto más, con lo que eso cuesta en velocidad.

Es una reforma con consecuencias de despliegue y de velocidad, **no un parche**,
y el dueño tiene que decidir si la quiere. Lo que sí se hizo es lo que se podía
hacer sin ella: que la llave importante —la larga— esté guardada de verdad, y que
ninguna llave pierda la marca de "solo por conexión cifrada".

Conviene tener presente qué protege esa marca y qué no. Protege de que un script
colado en la página **se lleve** la llave para usarla desde otro sitio. No
protege de un script colado en la página en general: desde dentro de la página,
con o sin marca, se pueden hacer peticiones como el usuario. Hoy el riesgo de que
se cuele un script es bajo —React escapa el texto solo y no hay ni un
`dangerouslySetInnerHTML` en toda la web, comprobado—, pero bajo no es cero.

### Código muerto encontrado de paso

`src/config/socket.ts`, `src/socket/events.ts` y `src/socket/middleware/` no los
importa nadie. Son otra implementación, vieja, de la autenticación del socket.
Nada las ejecuta, así que no son un agujero — pero son una trampa: el día que
alguien las enchufe, enchufa también la versión sin comprobaciones. Quedan
anotadas para borrarlas.

---

## 29. Dos agujeros críticos que no estaban en nuestro código

### Lo que se encontró

Un repaso de las librerías que usa el sistema (`npm audit`) sacó **10
vulnerabilidades conocidas y publicadas: 1 crítica y 7 altas**. Ninguna en código
escrito aquí — todas en librerías de terceros que el sistema usa.

La crítica, en **Next.js 16.3.1** (la versión que estaba instalada), son dos
fallos del mismo tipo:

- **Ejecución remota de código sin autenticación en servidores Windows.**
- **Ejecución remota de código sin autenticación** en el optimizador de imágenes
  cuando se usan archivos AVIF.

"Ejecución remota de código sin autenticación" significa que alguien de fuera
**ejecuta órdenes en el servidor sin necesidad de cuenta**. No es leer datos que
no le tocan: es tomar la máquina. Es la peor clase de fallo que existe.

Y el primero apunta justo a **servidores Windows**, que es donde se está
trabajando.

Esto importa como lección: el sistema puede estar bien escrito y aun así tener la
puerta abierta por una librería. **La seguridad no se audita una vez.**

### Qué se hizo

- **Next.js 16.3.1 → 16.3.5.** Las dos críticas desaparecen.
- `npm audit fix` para el resto sin cambios que rompan: quedaron 3.

| | Antes | Ahora |
|---|---:|---:|
| Críticas | 1 | **0** |
| Altas | 7 | 3 |
| Total | 10 | 3 |

### Las 3 que quedan

Las tres son de la herramienta de Prisma (`prisma`, `@prisma/config`,
`deepmerge-ts`) y exigen un salto de versión mayor, que sí puede romper cosas.

**No viajan al servidor.** `prisma` está declarada como herramienta de desarrollo;
lo que corre en producción es `@prisma/client`, que no está señalada. Afectan al
equipo donde se programa y se migran las bases, no al liceo.

Se dejan anotadas para hacer el salto con calma y con las pruebas delante, no
como parche de última hora.

### Comprobado después de actualizar

506 pruebas de integración · 17 de web · 118 de navegador. Todas en verde, con la
web recompilada sobre la versión nueva.

### Lo que esto añade a la lista de deberes

`npm audit` tiene que correrse **de forma periódica**, no una vez. Una librería
segura hoy no lo es dentro de tres meses. Va a `docs/DESPLIEGUE.md`.
ARCHIVO
python - <<'PY'
import io
p='docs/DESPLIEGUE.md'
s=io.open(p,encoding='utf-8').read()
eol='\r\n' if '\r\n' in s else '\n'
import re
m=re.search(r'^## \d+\. Lo que todavía falta', s, re.M)
assert m, 'no encontré la sección final'
bloque = eol.join([
 '## Revisar las librerías, cada mes',
 '',
 '```bash',
 'npm audit --omit=dev',
 '```',
 '',
 'No es opcional ni es una vez. Se encontró **Next.js con dos fallos críticos de',
 'ejecución remota de código sin autenticación** —uno específico de servidores',
 'Windows— en la versión que estaba instalada. El código propio estaba bien; la',
 'puerta la abría una librería.',
 '',
 'Una librería segura hoy no lo es dentro de tres meses. Si aparece algo',
 '**crítico o alto que llegue a producción**, se actualiza antes de desplegar.',
 '',
 'Lo que sale con `--omit=dev` es lo que de verdad viaja al servidor. Sin esa',
 'opción también salen las herramientas de desarrollo, que no se instalan allí.',
 '',
 '---',
 '',
 m.group(0),
])
io.open(p,'w',encoding='utf-8').write(s.replace(m.group(0), bloque, 1))
print('despliegue actualizado')
PY

---

## 30. Lo que se sube, ahora se mira por dentro

### El agujero

El logo y el ícono del liceo se guardaban **sin comprobar nada**:

```js
const ext = path.extname(filename);   // la extensión, del nombre que mandaba el usuario
fs.writeFileSync(filepath, buffer);   // el contenido, tal cual
```

Y esa carpeta (`uploads/`) **se sirve públicamente**, además con permiso de acceso
desde cualquier sitio.

Con eso, quien pudiera cambiar el logo podía dejar colgada en el dominio del
sistema **una página HTML cualquiera**. Eso no es un detalle: una dirección del
propio liceo sirviendo la página de un atacante es justo lo que se usa para
engañar a la gente. El dominio y el candado son los de verdad, así que nadie
sospecha.

El `multer` que sí tenía filtros (`middleware/upload.middleware.ts`) **no lo
usaba ninguna ruta**: era código muerto. Los filtros estaban escritos pero no
protegían nada. Eso es peor que no tenerlos, porque da la sensación de que el
tema está cubierto.

### Por qué no basta con mirar el tipo que dice el navegador

El `Content-Type` lo manda quien sube el archivo y se escribe a mano. Decir "esto
es una imagen PNG" no cuesta nada.

Ahora se miran **los primeros bytes**, que son los que de verdad dicen qué es un
archivo. Una PNG de verdad empieza siempre igual, y eso no se puede fingir sin
dejar de ser una PNG.

Además, **el nombre ya no decide la extensión**: se guarda con la que le
corresponde por su contenido. Una PNG de verdad llamada `trampa.html` se guarda
como `.png`; un HTML llamado `logo.png` se rechaza.

### El SVG queda fuera a propósito

Un SVG es una imagen, sí, pero por dentro es texto que el navegador ejecuta.
Servido desde el dominio del sistema es una puerta. Si algún día hace falta, se
acepta pero limpiándolo antes.

### Prueba

`tests/integration/subir-archivos.test.ts` (7 pruebas), incluidas: una página HTML
disfrazada de imagen, un SVG con instrucciones dentro, un ejecutable de Windows
con nombre de imagen, y la comprobación de que manda el contenido y no el nombre.

### Esto importa para lo que viene

El dueño quiere que **el profesor suba cualquier archivo al crear una actividad**.
Esa función se construye ahora sobre terreno revisado. Cuando se haga, hay que
decidir aparte: dónde se guardan (no en el disco del servidor), qué tipos se
aceptan —que serán más que imágenes— y cómo se sirven **sin** que se ejecuten en
el dominio del sistema.

---

## 31. Una prueba inestable, dicha como tal

`PAP-01` (papelera) **falla aproximadamente una de cada tres tandas completas**, y
pasa siempre cuando se corre sola.

No es un fallo del sistema: la papelera funciona y está probada. Es la prueba la
que no aísla bien algo cuando corre junto a las demás con la máquina cargada.

Se anota en vez de esconderla. **Una prueba que falla a veces es peor que una que
falla siempre**: entrena a la gente a ignorar el rojo, y el día que el rojo sea de
verdad nadie lo mirará.
ARCHIVO
echo "documentado"

---

## 32. La contraseña que venía de regalo

### El agujero

Al crear un usuario, esta línea decidía su contraseña:

```js
bcrypt.hash(userData.password || 'temporal123', 10)
```

Si no se mandaba contraseña, el sistema le ponía **`temporal123`**. La misma para
todas las cuentas creadas así, y escrita en el código fuente.

Reproducido: crear un alumno sin contraseña devolvía 201, y entrar con
`temporal123` devolvía **200**.

Y era alcanzable de verdad, no solo llamando a la API a mano: la pantalla de
crear usuario **borra ese campo cuando va vacío**, con este comentario al lado:

```js
} else if (!cleanedData.password) {
    // En creación si está vacío (aunque el validador debería atraparlo)
    delete cleanedData.password;
}
```

*"Aunque el validador debería atraparlo"*. Un guardia que "debería" no es un
guardia. Y aunque lo atrapara, vive en el navegador — que es justo lo que un
atacante controla.

### Lo que se hizo

- **Sin contraseña no se crea la cuenta.** Se exige en el servidor, con un
  mensaje que dice qué falta.
- **Cifrado más fuerte:** de 10 a 12 vueltas. Al que entra le cuesta unas décimas
  más y no lo nota; a quien pruebe contraseñas a lo bruto le cuesta **cuatro
  veces** más, y eso sí lo nota.
- **Cambiar la contraseña exigía 6 caracteres** cuando crearla exigía 8: se podía
  cambiar a una más débil de la que el sistema pide para nacer. Alineado a 8.

### Prueba

`tests/integration/contrasenas.test.ts` (6 pruebas): que no se pueda crear sin
contraseña, que `temporal123` ya no abra nada, que una corta se rechace con
motivo, que la contraseña **nunca viaje de vuelta** en la respuesta (ni siquiera
cifrada), y que se guarde cifrada con las 12 vueltas.

### Lo que esto dice del sistema en general

Tres de los agujeros encontrados hoy son el mismo error de fondo: **un guardia
escrito en el sitio equivocado**.

- Los filtros de subida existían… en un archivo que no usaba nadie.
- La comprobación de contraseña existía… en el navegador.
- La comprobación de identidad existía… después de servir la copia guardada.

Escribir la comprobación no basta. Tiene que estar **donde pasa la petición de
verdad**, y en el servidor, que es lo único que un atacante no controla.
ARCHIVO
npx playwright test --reporter=line --workers=1 2>&1 | tail -3

---

## 33. Funciones que decían haber hecho algo

Frente abierto: **que cada función, botón y acción haga lo que dice que hace, sin
ningún error**. Se atacó por el lado que más huecos deja: las acciones de la API
que **ninguna prueba tocaba nunca**.

### Cómo se buscaron

Igual que en la sección 27 y por el mismo motivo: no se leyó el código buscando
rutas, se le **preguntó al servidor** cuáles sirve de verdad (`printRoutes`) y se
buscó cada una en los 73 archivos de prueba del repositorio.

Resultado: **277 acciones, 28 sin aparecer en ninguna prueba**. Se escribieron
pruebas para las 16 que tocan datos del liceo (plan de evaluación, actividades,
notas, alumnos, observaciones, horarios, sesiones abiertas). Al escribirlas
salieron **nueve fallos reales**, seis de ellos de permisos.

### Lo que apareció

| Qué estaba mal | Qué pasaba en el liceo |
|---|---|
| **Copiar un plan de evaluación no miraba de quién es la sección** | Un profesor podía mandar su plan a una sección que no imparte. Y copiar **borra** lo que hubiera en el destino: el plan de la profesora de esa sección desaparecía y en su lugar quedaba el de él. Respuesta del sistema: *200, copiado*. Reproducido en PLAN-01: donde decía "Examen de Ana" quedó "Examen de Beto". |
| **Las observaciones de conducta las leía cualquiera** | `/observations/session/:id` y `/observations/subject/:sección/:materia` solo pedían tener la sesión abierta. Un alumno cualquiera pedía las observaciones de cualquier clase del liceo y recibía, con nombre y apellido, quién se portó mal y qué escribió el profesor. |
| **Cualquier profesor podía borrar la observación de otro** | Sobre un alumno de otra sección, de otra materia. La papelera guardaba la copia, sí, pero la observación desaparecía del expediente y nadie se enteraba. |
| **El expediente académico completo de un alumno reventaba siempre** | `GET /students/:id/complete-history` respondía **500** a todo el mundo, incluido el propio alumno. La consulta pedía una tabla llamada `attendance_records`, que **no existe**: la de asistencia se llama `daily_attendance`. Nunca funcionó. |
| **Mover un bloque de horario no comprobaba nada** | Crear un bloque sí miraba si chocaba; **moverlo, no**. Bastaba crearlo en un hueco libre y arrastrarlo encima de otro para dejar la sección con dos clases a la misma hora, o al profesor en dos aulas a la vez. |
| **El buscador de actividades no buscaba** | Para el profesor y para el alumno. La palabra escrita en la caja se perdía: el filtro por rol, escrito unas líneas más abajo, **borraba** el de la búsqueda al escribir en el mismo sitio. Al administrador sí le funcionaba, porque su rol no escribe ahí. |
| **Guardar el plan sin la lista de filas decía "error interno"** | Igual que copiar sin decir a qué secciones. Un 500 que hace pensar que el sistema está roto cuando lo que faltaba era un dato. |

### Y dos números que no cuadraban entre pantallas

| Qué estaba mal | Qué pasaba en el liceo |
|---|---|
| **La nota mínima para aprobar estaba escrita en el código: 9,5** | En todas las pantallas de promedios (`/api/statistics/…`: materia, sección, grado y ciclo). El resto del sistema usa la del instituto (10 por defecto). Así que el **mismo alumno con 9,7** salía *aprobado* en el promedio de su sección y *reprobado* en su perfil, en el panel y en la promoción. Y un liceo que pusiera su mínima en 12 no cambiaba nada ahí. Va contra la regla 2 de `CLAUDE.md` y contra lo escrito en el mapa de cálculos. |
| **Un alumno sin ningún registro de asistencia contaba como "asistencia baja"** | El primer día del curso, antes de que nadie pasara lista, la sección salía con **todos** sus alumnos "con asistencia baja". El propio comentario del código dudaba: *"Assuming 0 records is bad or neutral?"*. El mapa de cálculos ya decía lo contrario: los días sin toma de asistencia no penalizan. |

### Un 200 que no traía nada

`GET /api/attendance/summary/student/:id` respondía **200 con la caja vacía**. La
ruta declaraba una plantilla de respuesta con unos campos (`totalDays`,
`present`, `absent`…) y el código enviaba otros (`student`, `attendances`,
`summary`). Fastify solo deja pasar lo declarado, así que se caía todo por el
camino, en silencio.

Había una prueba sobre esa ruta (NUM-11) y pasaba: **solo comprobaba que
respondiera 200**. Es el riesgo que la sección 15 dejaba anotado — "hay acciones
contadas como cubiertas donde la prueba solo comprueba que responden, no el
contenido" — y aquí se cobró una.

### Lo que se hizo

- **Copiar plan**: se comprueba el origen y **cada** destino antes de tocar nada.
  Si uno solo no es suyo, no se copia ninguno.
- **Observaciones**: leer y borrar pasan por la misma regla que escribirlas —
  la clase tiene que ser suya; el administrador pasa siempre.
- **Expediente completo**: la consulta apunta a la tabla que existe. Se barrieron
  además **todas** las consultas SQL a mano del servidor comparándolas con el
  esquema: `attendance_records` era la única tabla inventada.
- **Horario**: mover un bloque usa `findScheduleConflicts`, la misma fuente única
  que el resto de vías de guardado, así que aplica las dos reglas duras (una
  sección no recibe dos clases a la vez; un profesor no está en dos sitios).
- **Buscador de actividades**: la búsqueda va en su propio sitio y ya no se pisa
  con el filtro por rol.
- **Nota mínima**: se lee la del instituto. Va también en la clave de lo
  guardado en caché, para que cambiarla no siga contestando con la anterior.
- **Errores que mentían**: falta un dato → 400 diciendo cuál, no 500.

### Pruebas

Tres archivos nuevos, **47 pruebas**:

- `auditoria-plan-y-actividades.test.ts` (13): PLAN-01 a PLAN-08, ACT-01 a ACT-05.
- `auditoria-acciones-sin-probar.test.ts` (28): observaciones, alumnos, notas,
  horarios, sesiones abiertas, conteos de usuarios y avisos.
- `auditoria-numeros-que-no-cuadran.test.ts` (6): CAL-01 a CAL-06.

Todas se escribieron **fallando primero** contra el sistema tal y como estaba.

### Cobertura de la API, medida otra vez

De **28 acciones sin ninguna prueba a 12**. Las 12 que quedan:

- 8 del monitoreo interno del superadministrador (métricas de consultas, de
  caché, historial de alertas, reprovisionar y migrar un liceo, renovar su
  sesión). Si fallan, no se pierde ninguna nota.
- `POST /api/institutes/logos` (subir el logo del liceo).
- `GET /api/instituto/:slug/info` y `GET /api/health`.
- `GET /api/notifications/stats`, que merece una línea aparte: el comentario de
  la ruta dice *"Stats globales del sistema"* y lo que devuelve son **los avisos
  del propio administrador**, exactamente igual que `/my-notifications/stats`.
  No lo usa ninguna pantalla. No se tocó: el nombre miente, pero nadie lo lee.

### Decisiones que necesitan al dueño

1. **El 80% de asistencia mínima sigue fijo en el código.** La nota mínima es
   configurable por liceo; esta no, y no hay campo para ella. ¿Se añade
   `asistenciaMinima` a la configuración del instituto, o se deja en 80 para
   todos?
2. **Copiar el plan de evaluación no lo usa ninguna pantalla.** El botón no
   existe en la web (`useCopyPlan` no lo importa nadie), pero la puerta estaba
   abierta en la API. Ahora está cerrada. ¿Se quiere la pantalla, o se retira la
   ruta?

---

## 34. Una prueba inestable: dicha mejor, no resuelta

`PAP-01` (papelera) sigue siendo la de la sección 31. En esta sesión falló una
vez —y esa vez cayó en `PAP-02`, no en `PAP-01`— y pasó la siguiente. Las dos
fallan igual: *no hay copia en la papelera*.

Lo que se encontró al mirarlas: **ninguna de las dos miraba lo que el servidor
contestaba al borrar**. Llamaban a borrar, no comprobaban nada, y después se
quejaban de que faltaba la copia. Así, el rojo apuntaba a la papelera cuando el
problema estaba antes: el borrado ni siquiera había ocurrido.

---

## 35. Cuánto falta (actualizado)

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas | 30% | 265 de 277 acciones (96%), y las nuevas comprueban el dato, no solo que responda | 27% |
| Permisos y seguridad de acceso | 20% | Seis agujeros más cerrados: plan de evaluación, observaciones (leer y borrar), horarios | 19% |
| Exactitud de cálculos | 15% | Nota mínima ya configurable en todas las pantallas; asistencia sin datos no penaliza | 14% |
| Interfaz probada de verdad | 15% | 118 pruebas de navegador en verde | 11% |
| Resistencia a fallos | 10% | Doble clic, edición simultánea, guardados a medias y ahora datos incompletos | 7% |
| Rendimiento con 5.000 usuarios | 5% | Pendiente de repetir con el generador en otro equipo | 1% |
| Despliegue y operación | 5% | Respaldos con prueba de restauración; falta archivos en la nube | 3% |

**Total: ~82% verificado. Falta ~18%.**

Lo que más mueve la aguja ahora: **el pozo de conexiones** (elegir 2 o 25 midiendo
en igualdad de condiciones, 4%), que además es el sospechoso de la prueba
inestable; y **terminar resistencia a fallos** (3%).

---

## 36. El botón que no existía para una función que sí

**Lo que el dueño dijo.** *"Copiar un plan de evaluación no tiene pantalla… yo lo
quería para que un profesor pudiera pegar ese plan a otra sección que se la
quiera dar"*.

Tenía razón, y era la mitad exacta del problema: la función existía en el
servidor, estaba probada y desde la sección 28 estaba bien protegida — pero
**ninguna pantalla la usaba**. Un profesor que da Matemáticas en 1ºA y 1ºB tenía
que escribir el mismo plan dos veces.

**Lo que se hizo.** El botón *"Copiar a otra sección"* en el plan de evaluación,
con la lista de secciones y un aviso de lo que va a pasar (copiar **reemplaza**
el plan que hubiera en el destino; las notas ya puestas no se tocan).

**La parte que importa: la lista no la arma la pantalla.** La decide el servidor,
con la misma regla que luego aplica al copiar. Si la pantalla eligiera las
secciones por su cuenta, acabaría ofreciendo alguna que el servidor va a
rechazar, y el profesor marcaría una casilla para recibir un *"no tienes
permisos"* sin entender por qué. Al profesor se le ofrecen solo las secciones
donde **da esa misma materia** (ser guía no basta para planificar); al admin,
todas las que la tengan; a nadie, la sección de origen ni las de otro año
escolar.

Cinco pruebas nuevas (PLAN-3A a PLAN-3E). La que más vale es **PLAN-3C**: copia a
*todo* lo que la lista ofrece y exige que no se rechace ninguna. Es la que
garantiza que el botón nunca miente.

---

## 37. Una nota, quince recorridos

Esto no lo pidió nadie: salió midiendo.

Cuando un profesor guarda una nota, hay que tirar la copia guardada de toda la
gente a la que le cambia lo que ve —el alumno, sus representantes, los profesores
de la sección, los admins—. Suelen ser diez o quince personas.

Se hacía **una llamada por cabeza**, y cada llamada **recorre todas las claves
guardadas del sistema**. Una sola nota provocaba quince recorridos completos, uno
detrás de otro, con el profesor esperando a que terminaran.

Ahora se recorre **una vez** y se comparan los quince patrones contra cada clave.
Se borra exactamente lo mismo que antes; el trabajo es el de una sola llamada.

Medido, no deducido: **LIMP-08** deja escrito que antes eran 15 recorridos y
**LIMP-07** que ahora es 1, los dos ejecutando el código de verdad contra un
Redis de mentira que cuenta las búsquedas que recibe. Las seis pruebas restantes
(LIMP-01 a LIMP-06) son las que importan de verdad: que no se borre ni una clave
de más —incluida la de alguien con la misma cédula en otro liceo— ni una de
menos.

"""
assert ancla in s
s=s.replace(ancla, nuevo+ancla,1)
io.open(p,'w',encoding='utf-8',newline='').write(s)
print("auditoria actualizada")
PY

---

## 38. Cuánto falta (actualizado)

| Resistencia a fallos | 10% | Doble clic, edición simultánea, guardados a medias y ahora datos incompletos | 7% |
| Rendimiento con 5.000 usuarios | 5% | Pendiente de repetir con el generador en otro equipo | 1% |
| Despliegue y operación | 5% | Respaldos con prueba de restauración; falta archivos en la nube | 3% |

**Total: ~82% verificado. Falta ~18%.** (588 pruebas de integración en verde, 62
archivos, cero fallos — incluidas las dos que salían inestables. El total no sube
porque lo de esta tanda fueron arreglos y cobertura, no un trozo nuevo del
sistema dado por verificado.)

Lo que más mueve la aguja ahora: **el pozo de conexiones** (elegir 2 o 25 midiendo
en igualdad de condiciones, 4%), que además es el sospechoso de la prueba
inestable; y **terminar resistencia a fallos** (3%).

---

## 39. El pozo de conexiones: por qué era 2, y qué cuesta

Era lo que más movía la aguja y llevaba pendiente desde la prueba grande, donde
el 15% de las peticiones murieron todas con el mismo error: *"Timed out fetching
a new connection from the connection pool (connection limit: 2)"*.

**Por qué las corridas con k6 no lo contestaban.** El generador de carga corre en
la misma máquina que la API y que PostgreSQL. Todo salía a 12 segundos de media,
y con pozo 25 salía *peor* que con 2. Eso no mide el sistema: mide el PC. Estaba
anotado en la auditoría anterior como "pendiente de repetir en otro equipo".

**Cómo se midió en su lugar.** Sin HTTP y sin k6: se abre un cliente contra la
base de un liceo con N conexiones, se le lanza la consulta más pesada —la lista
de alumnos de una sección— desde 200 sitios a la vez, y se mira la espera. Aísla
la variable en cuestión y nada más.

| `TENANT_CONNECTION_LIMIT` | 200 a la vez | |
|---|---|---|
| 2 | 550 ms | |
| 5 | 327 ms | 1,7× más rápido |
| 10 | 245 ms | 2,2× más rápido |
| 25 | 215 ms | **2,6× más rápido** |

**De dónde salía el 2.** Todas las bases de los liceos viven en el MISMO servidor
de PostgreSQL, y el máximo de conexiones es del servidor entero, no de cada base.
El sistema guarda hasta 50 clientes de liceo a la vez:

```
50 liceos × 2 conexiones = 100 = el máximo de fábrica de PostgreSQL
```

No era arbitrario. Lo que pasaba es que **no estaba escrito en ninguna parte**,
así que parecía un número puesto a dedo.

**Lo que apareció haciendo la cuenta bien: ni el 2 cabe.** PostgreSQL reserva 3
plazas para el superusuario, así que da **97**, no 100. Con 50 liceos llenos a la
vez faltan 3 conexiones. No es urgente —hacen falta 50 liceos con gente dentro al
mismo tiempo— pero es real.

**Qué se hizo.** No subir el número a ciegas: el correcto depende de cuántos
liceos vayan a ese servidor, y eso lo sabe quien despliega, no el código. En su
lugar, **el servidor hace la cuenta al arrancar y lo dice** en el registro, con
el número que sí cabría y las tres salidas posibles (bajar el límite, subir
`max_connections`, o levantar PgBouncer). No corta el arranque: un servidor que
no levanta es peor que uno apretado.

La tabla de qué poner según cuántos liceos haya está en `docs/DESPLIEGUE.md`.
Nueve pruebas (CONN-01 a CONN-09), incluida la que comprueba que con PgBouncer
delante el aviso **no** salta, porque ahí la cuenta no aplica y sería una alarma
falsa en cada arranque.

"""

assert ancla in s
s = s.replace(ancla, nuevo + "## 40. Cuánto falta (actualizado)", 1)
io.open(p,'w',encoding='utf-8',newline='').write(s)
print("ok")
PY
grep -n "^## 3[89]\|^## 40" docs/AUDITORIA-FUNCIONAL.md

---

## 40. Probar contraseñas una detrás de otra

Esto no estaba en la lista. Salió yendo a por resistencia a fallos.

**Lo que se midió antes de tocar nada.** Quince contraseñas contra el mismo
profesor, cada una desde una dirección de internet distinta. Resultado:
**las quince pasaron, ninguna frenada**, y la contraseña buena seguía entrando
después. No había nada parando eso.

**Por qué.** El sistema exige contraseñas de 8 caracteres y las guarda con
bcrypt a 12 vueltas — correcto, pero eso protege la contraseña *si alguien se
lleva la base de datos*. Contra alguien probando contraseñas en la pantalla de
entrar había un único guardia, el contador de peticiones, y **cuenta por
dirección de internet, no por cuenta**. Cualquiera con un móvil y el wifi de
casa ya tiene dos direcciones.

**Lo que se hizo.** La cuenta se cierra tras 10 fallos y se abre sola a los 15
minutos, **venga el intento de donde venga**. Los mismos números que usa Windows.

Tres decisiones que no son obvias y quedan escritas en el propio código:

- **La contraseña buena tampoco entra mientras está cerrada.** Si entrara, el
  cierre no serviría de nada: al que está probando le bastaría con seguir hasta
  dar con ella (BRUTO-02).
- **El aviso no dice si la cuenta existe.** Un mensaje distinto para una cuenta
  real le regalaría al atacante la mitad del trabajo: saber a quién atacar
  (BRUTO-03).
- **El precio, dicho claro:** quien sepa el correo de un profesor puede dejarlo
  fuera 15 minutos. Lo pagan todos los sistemas que tienen esta defensa. Se paga
  porque lo otro es peor: sin esto no está fuera un profesor 15 minutos, están
  dentro las notas de todo el liceo.

**Y se borró un archivo que engañaba.** `src/plugins/rate-limit.ts` no lo
importaba nadie, pero tenía dentro un límite por correo con buena pinta. Quien
lo leyera pensaría que el login ya estaba protegido por cuenta. No lo estaba.

---

## 41. La credencial ya no se puede leer desde la página

Era la decisión que llevaba semanas abierta. El dueño dijo *"como lo veas
mejor"*, así que se hizo.

### Lo que había

Al entrar, el sistema entrega dos llaves: la **larga** (`refresh_token`), que
sirve durante días, y la **corta** (`access_token`), que dura 15 minutos y es la
que se enseña en cada petición.

La larga estaba bien guardada, marcada `httpOnly`: ningún programa de la página
puede leerla. La corta, no — y el propio código decía por qué:

```
httpOnly: false, // Not HttpOnly so axios interceptor can read it via document.cookie
```

Se dejó abierta **a propósito**, porque hacía falta leerla desde el navegador
para ponerla en cada petición. El problema es que cualquier cosa que consiga
ejecutar código en la página la lee con una línea y se la lleva; y fuera sirve
quince minutos desde cualquier parte del mundo.

### Lo que se hizo

La llave corta vive **solo en la memoria de la pestaña**. No está en cookies, ni
en `localStorage`, ni en `sessionStorage`. No hay de dónde copiarla.

La cookie `access_token` sigue existiendo pero marcada `httpOnly`, porque la lee
**el guardián de pantallas**, que corre en el servidor y sí puede. Desde la
página ya no se ve.

Al recargar, la memoria se vacía —que es justo lo que se busca— y se pide una
llave nueva con la larga. Una petición más al abrir, a cambio de que no quede
ninguna credencial por escrito.

### Lo que esto NO arregla, dicho claro

Si alguien consigue ejecutar código dentro de la página, **puede seguir haciendo
peticiones como tú mientras la pestaña esté abierta**: está dentro. Lo que ya no
puede es llevarse la llave y usarla luego desde su casa. La diferencia es entre
"un rato, aquí" y "quince minutos, en cualquier parte".

Tres pruebas nuevas (LLAVE-04, LLAVE-05, LLAVE-06): que no se lea desde la
página, que no quede ninguna credencial en el almacén del navegador, y que aun
así recargar no eche a nadie.

### Los tres fallos que destapó

**1. Borrar cookies `httpOnly` desde el navegador no funciona, y se intentaba en
tres sitios.** `clearSession()` y `handleLogout()` quitaban las llaves con
`document.cookie`. Eso **nunca** funcionó para la llave larga —ya era
`httpOnly`—, así que ese "cerrar sesión" la dejaba viva. Tres sitios con la misma
idea equivocada copiada; solo se vio al cerrar la cookie que faltaba.

**2. El tiempo real se quedaba mudo para siempre.** El socket leía la credencial
de las cookies. Al cerrarlas dejó de conectar — pero lo grave no fue eso, sino lo
que se vio al arreglarlo: si al abrir la página no se conseguía la credencial al
primer intento, **esa pestaña se quedaba sin avisos para siempre y sin decir
nada**. Lo que otro guardara no se vería hasta recargar. Ahora reintenta.

**3. Entre abrir la pantalla y quedar conectado, los avisos se perdían.** El
aviso se manda cuando todavía no hay nadie escuchando, y no se repite. Se ve
poco y se nota mucho: abres la lista de materias, otro crea una en ese segundo, y
no la ves hasta recargar. Ahora se piden los datos también **al conectar**.

Ese hueco existía desde antes; moverse a memoria lo hizo más ancho y por eso
apareció.

### Y el que estaba escondido debajo: un cupo para todo el liceo

Al hacer que la credencial se renueve en cada carga de página, empezó a fallar
una prueba de sesión. La causa resultó no tener nada que ver con el cambio:

**Todas las renovaciones de sesión de un liceo compartían un solo cupo de diez
por minuto.**

El contador armaba su clave con `dirección + correo`. Al renovar no se manda
correo, así que quedaba en `dirección + vacío` — y un liceo sale a internet por
**una sola conexión**. Diez renovaciones cualesquiera, de quien fuera, y todos
los demás recibían "demasiados intentos" y acababan en la pantalla de entrar.

Medido antes de tocarlo: doce renovaciones seguidas desde la misma dirección, la
undécima ya devolvía 429.

Existía desde antes: con renovaciones cada ~15 minutos por persona y 200
usuarios, ya se pasaba del límite — de forma intermitente, de esas que se echan a
la culpa de "internet va lento". Al renovar en cada carga se volvió imposible de
no ver.

Ahora cada sesión lleva su propia cuenta, por la huella de su llave larga. Cuatro
pruebas (CUPO-01 a CUPO-04), incluida la que comprueba que machacar **una** llave
sigue frenándose.

Es **el mismo fallo que este repo ya había corregido dos veces** —"un liceo sale
a internet por una sola conexión"— y que aquí se había quedado.

---

## 42. El repartidor de producción era un esqueleto

Esto salió de una pregunta del dueño. Al explicarle que el tiempo real, cuando no
puede mantener la conexión abierta, "se pasa a pedir por HTTP", preguntó: *"¿no
debería ser HTTPS?"*.

La respuesta corta era que ahí "HTTP" no se opone a "HTTPS" sino a "conexión
permanente": son dos formas de hablar, no dos niveles de cifrado. Pero la
pregunta llevaba detrás otra mejor —*¿de verdad esto va por HTTPS?*— y al ir a
comprobarlo apareció que **no**.

### Lo que había

`docker/nginx/nginx.conf` escuchaba **solo en el puerto 80**, sin cifrado. El
`docker-compose.prod.yml` abría el 443 y montaba los certificados en
`/etc/nginx/certs`, pero nginx **nunca los usaba**: no había ni una línea
`ssl_certificate`. Le faltaban además dos cosas, y cada una rompía algo distinto:

| Faltaba | Qué rompía |
|---|---|
| `listen 443 ssl` + certificados | **Nadie podría entrar.** Las llaves de sesión van marcadas `Secure` en producción, o sea que el navegador no las manda por conexión sin cifrar |
| `Upgrade` / `Connection` | El tiempo real no puede mantener la conexión y se cae a preguntar por HTTP: más gasto y más tarde. Justo lo contrario de lo que se prometió |
| `X-Forwarded-For` | Al servidor le llegan todas las peticiones desde la dirección de nginx: las 200 personas de un liceo parecen una sola y comparten cupo |

La primera es la buena noticia dentro de la mala: falla ruidosamente. Nadie
habría desplegado esto y creído que iba bien; simplemente no se habría podido
entrar. Lo que no se habría sabido es **por qué**.

### Y el de dentro: el servidor se fiaba de cualquiera

`trustProxy: true` significa *"fíate de quien sea que diga desde qué dirección
llama"*. Esa dirección la escribe quien llama, en una cabecera, y con ella se
cuentan los intentos de entrar.

O sea: **los límites por dirección se esquivaban cambiando un número**. No es
teoría — se comprobó: quince contraseñas contra la misma cuenta, cada una
diciendo venir de otra dirección, y las quince pasaron el contador (BRUTO-01).

Ahora solo se acepta esa cabecera **desde direcciones internas**, que es donde
vive el repartidor y donde no puede estar un cliente de internet. Configurable
con `TRUSTED_PROXIES`, y con la escotilla (`true`) avisando en el registro de lo
que significa. Siete pruebas (FIAR-01 a FIAR-07), incluida la que impide que
alguien vuelva a poner "de cualquiera" como valor por defecto.

### Una pieza clave: se escribe, no se añade

En el nginx nuevo:

```
proxy_set_header X-Forwarded-For $remote_addr;
```

**Escribe** la cabecera; no añade a lo que trajera el cliente. Si se añadiera —
que es lo que hace el ejemplo que todo el mundo copia— cualquiera podría poner
una dirección inventada delante y el servidor se la creería. Escribiéndola, la
única dirección que llega es la de verdad.

### Lo que hay que hacer antes del primer despliegue

Conseguir los certificados y dejarlos en `docker/nginx/certs/` con los nombres
`fullchain.pem` y `privkey.pem`. **Si no están, nginx no arranca** — a propósito:
antes arrancaba sin cifrado y el fallo aparecía como "no puedo entrar y no sé por
qué". Ahora falla al desplegar, diciendo qué falta.

Los pasos, con los comandos, están en `docs/DESPLIEGUE.md` §5-bis, incluida la
renovación cada 90 días sin tirar el sitio.

**No se pudo probar el arranque de nginx**: en esta máquina Docker no está
levantado, así que la configuración está escrita y revisada pero **no ejecutada**.
Es lo primero que habría que comprobar al desplegar.

---

## 43. Rendimiento: medido por fin con números que valen

La auditoría llevaba desde el principio con esta parte en amarillo, y con un
motivo escrito: *"pendiente de repetir con el generador en otro equipo"*.

**Por qué las medidas anteriores no valían.** Las corridas con k6 lanzaban el
generador de carga **en la misma máquina** que la API y que PostgreSQL. Los tres
se peleaban por el mismo procesador, así que todo salía a 12 segundos de media y
—lo que delata el problema— con el pozo de conexiones en 25 salía *peor* que con
2. Eso no mide el sistema: mide el PC.

**Cómo se midió ahora.** Con un generador que casi no gasta (unas líneas de Node
llamando a la API de verdad), tres medidas distintas que contestan tres preguntas
distintas:

| Medida | Qué contesta | Comando |
|---|---|---|
| Pantallas, una a una | ¿Cuánto tarda abrir cada cosa? | `npm run medir:pantallas` |
| La misma, con gente a la vez | ¿Aguanta cuando entran muchos? | `npm run medir:concurrencia` |
| Guardar | ¿Y lo que el profesor hace todo el día? | `npm run medir:guardado` |

### Lo que tarda cada pantalla (liceo de pruebas, 600+ personas)

| Pantalla | p50 | p95 |
|---|---|---|
| Panel del admin | 2 ms | 3 ms |
| Panel del profesor | 1 ms | 2 ms |
| Lista de usuarios | 7 ms | 9 ms |
| Buscar usuario por texto | 9 ms | 10 ms |
| **Alumnos de una sección** (la más pesada) | **26 ms** | **30 ms** |
| Medidores de la sección | 3 ms | 4 ms |
| Ficha de un alumno | 4 ms | 5 ms |
| Notas de una materia | 2 ms | 2 ms |
| Estadísticas del ciclo | 2 ms | 2 ms |

Ninguna pasa de 30 ms. El objetivo que se puso el dueño era *"60 ms, al
instante"*: se cumple con holgura.

Y la más pesada, **para el profesor tarda 2 ms**, porque a él sí se le guarda
copia. Los 26 ms son los del admin, que es quien menos la abre.

### Lo que apareció midiendo: guardar las notas era 13 veces más lento de lo necesario

Hasta ahora solo se había medido **abrir** pantallas. Pero un profesor no se pasa
el día abriendo: se lo pasa **guardando**, y eso no estaba medido.

Guardar las notas de una sección (29 alumnos): **361 ms**.

**Por qué.** Se guardaban de una en una, y cada nota comprobaba **diez cosas
contra la base**. De esas diez, seis son idénticas para toda la tanda —la
actividad, el lapso, la materia, el profesor, y que ese profesor imparta esa
materia en esa sección—: no cambian de un alumno al siguiente, y se preguntaban
veintinueve veces seguidas. Unas **300 consultas** por un solo "guardar".

Y encima, tirar las copias guardadas se hacía por alumno. Cada limpieza recorre
**todas** las claves del almacén: **145 recorridos completos** por una tanda de
notas.

**Lo que se hizo.** Lo común se pregunta una vez; lo que varía por alumno se
pregunta para todos de golpe; las notas se escriben juntas; las copias se tiran
de una pasada. De ~300 consultas a ocho, sin importar cuántos alumnos haya.

| | Antes | Ahora | |
|---|---|---|---|
| Guardar 29 notas | 361 ms | **28 ms** | 13× más rápido |
| Por alumno | 12,4 ms | 0,95 ms | |
| Consultas a la base | ~300 | 8 | |
| Recorridos del almacén | 145 | 1 | |

**Se comprueba exactamente lo mismo que antes**, con los mismos mensajes y el
mismo número de fila: que la nota esté en rango, que el alumno exista y **esté
inscrito en esa sección**, que el profesor imparta esa materia ahí, y que no
hubiera ya una nota puesta. Sigue siendo todas o ninguna. Lo vigilan RES-04 y
RES-10, que pasaron sin tocarlas.

**Es la tercera vez que aparece el mismo fallo de fondo en este sistema**:
borrar de uno en uno lo que se puede borrar de una pasada. Primero en el aviso de
cambios (15 recorridos → 1), luego en las notas por alumno (87 → 1), y ahora en
la limpieza por nota (145 → 1). Cada una se encontró midiendo, no leyendo.

### Cuando entran muchos a la vez

Lanzando la misma pantalla desde N sitios a la vez, en esta máquina (donde el
generador compite con el servidor y con la base):

| A la vez | Panel del admin | Lista de usuarios | Alumnos de una sección |
|---|---|---|---|
| 1 | 1 ms | 12 ms | 29 ms |
| 25 | 12 ms | 58 ms | 253 ms |
| 100 | 50 ms | 225 ms | 951 ms |
| 200 | 139 ms | 464 ms | 1.896 ms |
| **Techo** | ~1.800/s | ~420/s | ~105/s |

Lo que se lee de ahí: el sistema no se cae ni devuelve errores en ningún punto —
hace cola, que es lo correcto. Para un liceo de 500 personas, la pantalla más
pesada a 105 por segundo da de sobra; y para el profesor, que es quien la abre,
sale de la copia guardada.

**Se probó si el pozo de conexiones era el cuello**: se repitió todo con
`TENANT_CONNECTION_LIMIT=10` y el techo se quedó igual (105/s). No es el pozo. Es
el procesador de esta máquina repartido entre tres cosas.

### Lo que sigue sin poder medirse aquí

Los números de arriba son del **servidor**, no del sistema entero bajo carga
real. Para eso hace falta el generador en otra máquina, y sigue pendiente. Lo que
ya no está pendiente es saber cuánto tarda cada cosa y dónde estaba lo lento.

## 45. Las diecisiete pantallas que nadie había abierto

Se contaron las pantallas del sistema y se buscó cada una en las pruebas de
navegador. De **40 pantallas, diecisiete no aparecían en ninguna**: el sistema
las ofrecía y nadie había comprobado jamás que abrieran.

Una pantalla que no abre no es un detalle de acabado: es un profesor delante de
una página en blanco a mitad de clase.

**Qué se comprueba de cada una** (ABRE-01 a ABRE-15, veinte pruebas):

1. que abra de verdad — no una página en blanco, no un error de programa;
2. que no la abra quien no debe;
3. que no se escape nada — ni credenciales ni tripas de la base, ni a la vista
   ni escondidas en el código que llega al navegador.

Ahora son **37 pantallas y ninguna sin probar**.

### Lo que apareció al escribirlas

**1. Un bucle infinito en el panel del superadmin.** Con una credencial pero sin
los datos de sesión —que pasa si una caduca antes que la otra, o si un cierre de
sesión se queda a medias—, el navegador quedaba atrapado:

- la pantalla de entrar miraba **solo la credencial**: "ya estás dentro" → al panel;
- el panel miraba **la credencial Y los datos**: "no estás dentro" → a entrar.

Cada puerta mandaba a la otra. Resultado: *"demasiadas redirecciones"* y el
superadmin **sin poder ni llegar a la pantalla de entrar** para arreglarlo.

Una diferencia de una palabra entre dos condiciones que tenían que ser la misma.
Ahora las dos preguntan lo mismo, y la que rebota **borra lo que sobra** para que
un resto de sesión no pueda volver a encerrar a nadie.

No se veía probando contra la API: la API responde 401 y ya está. Solo se ve
abriendo el navegador.

**2. Cuatro pantallas de trabajo sin guardián.** `/dashboard/clases`,
`/dashboard/aulas`, `/dashboard/horario` y la gestión de una clase no estaban en
la lista de pantallas por rol. Un alumno identificado podía abrirlas.

Los datos nunca estuvieron en riesgo —el servidor comprueba los permisos por su
cuenta y le habría devuelto una pantalla vacía— pero la puerta de la casa estaba
abierta, y eso no es lo acordado.

**3. Y una que me inventé yo, corregida por las pruebas.** Al añadir esos
guardianes metí también `/dashboard/calendario`, dando por hecho que era una
pantalla de gestión. **No lo es: el alumno y el representante la usan** para ver
sus clases. Los dejé fuera de su propio calendario.

Lo cazó `PANT-estudiante`, una prueba que ya existía desde antes y que dice qué
pantallas son de cada rol. Está revertido, y queda escrito al lado para que nadie
lo vuelva a "arreglar".

### Tres cosas que se borraron

| Qué | Por qué |
|---|---|
| `/dashboard/estudiantes` | Decía *"Esta sección está en desarrollo"*. Nadie la enlazaba |
| `/dashboard/actividades` | Lo mismo |
| `/dashboard/debug` | Volcaba el JSON crudo del panel del alumno. Herramienta de desarrollo |

Las tres estaban dentro de la parte identificada del sistema y ninguna aparecía
en el menú: solo se llegaba escribiendo la dirección. Ninguna hacía daño; las dos
primeras prometían una función que no existe, y la tercera no tiene sitio en algo
que usa un liceo.

### Y 104 cuentas de superadmin de prueba

Mirando otra cosa apareció esto: la base de plataforma tenía **106 cuentas de
superadmin activas**, casi todas `sa-<número>@test.com`. Las crea el ayudante de
las pruebas y **nadie las borraba**: cada tanda dejaba las suyas.

Un superadmin entra a **todos los liceos**. En una base de desarrollo es
suciedad; si esa base llega a producción —y es la misma que usan las pruebas—
son cien puertas abiertas.

Se borraron (quedó una, la de verdad) y **ahora la limpieza de fin de tanda se
las lleva**, como ya hacía con el instituto de pruebas.

---

## 46. Cuánto falta (actualizado)

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas | 30% | **278 de 278 acciones (100%)**: no queda ninguna sin que alguien la haya probado | 30% |
| Permisos y seguridad de acceso | 20% | Fuerza bruta cerrada por cuenta; la credencial fuera del alcance del navegador; ya no se puede mentir sobre la dirección desde la que se llama; cuatro pantallas de trabajo con su guardián | 20% |
| Exactitud de cálculos | 15% | Nota y asistencia mínimas configurables; arreglado el resumen por grado; el guardado en lote comprueba exactamente lo mismo que antes | 14% |
| Interfaz probada de verdad | 15% | **37 pantallas, ninguna sin prueba de navegador**. 148 pruebas en verde | 14% |
| Resistencia a fallos | 10% | Doble clic, edición simultánea, guardados a medias, datos incompletos y Redis cayéndose sin que nada se abra | 9% |
| Rendimiento | 5% | Medido de punta a punta; el guardado de notas, 13× más rápido; falta la corrida con el generador en otro equipo | 4% |
| Despliegue y operación | 5% | Respaldos probados; **el cifrado del repartidor escrito pero nunca ejecutado** (aquí no hay Docker); faltan los respaldos fuera del servidor | 3% |

**Total: ~94% verificado. Falta ~6%.**

667 pruebas de servidor (68 archivos) y 148 de navegador, todas en verde.

### Las tres cosas que faltan, y por qué no se pueden hacer desde aquí

**1. La corrida de rendimiento con el generador en otra máquina (1%).**
Lo que hay medido son los tiempos del servidor, que es lo que nota quien usa el
sistema, y están todos por debajo de 35 ms. Lo que falta es el comportamiento
bajo carga real y sostenida, y **para eso hace falta un segundo equipo**: en este,
el generador le quita procesador al servidor y a la base, y lo que sale es el PC.

**2. Levantar el repartidor con cifrado (1%).**
La configuración está escrita, revisada y con el motivo de cada línea al lado —
pero **nunca se ha ejecutado**, porque en esta máquina Docker no está levantado.
Es lo primero que hay que comprobar al desplegar, y `docs/DESPLIEGUE.md` §5-bis
tiene los pasos.

**3. Sacar los respaldos del servidor (2%).**
Hoy se respalda cada liceo y se prueba la restauración, pero los respaldos viven
en la misma máquina. Si se quema, se queman con ella. Es tarea de despliegue, no
de código.

Queda además un 2% repartido en los dos casos de resistencia que no se pueden
simular de forma fiable sin tocar la máquina: que PostgreSQL deje de responder a
media escritura, y que se llene el disco.

### Una prueba inestable, dicha como tal

`NOT-01` (las notas de una materia) falló **una vez de tres tandas completas**.
Las otras dos pasó. Es la misma familia que `PAP-01` y `ACT-05`, ya anotadas: se
caen en la tanda completa y pasan al correrlas solas. La sospecha sigue siendo el
pozo de conexiones bajo pruebas en paralelo, y sigue **sin demostrarse**.

Se deja escrito en vez de callarlo: una prueba que falla una de cada tres veces
es una prueba en la que no se puede confiar del todo, y eso hay que saberlo.

---

## 47. Dos liceos compartiendo la misma memoria

Este es el fallo más grave que ha aparecido en toda la auditoría, y apareció de
rebote: leyendo el servicio de alumnos para otra cosa.

### El agujero

Los datos de cada liceo están en **su propia base**, y eso los aísla de verdad.
Pero la *memoria rápida* —lo que se guarda un rato para no volver a preguntar lo
mismo— es **una sola para todo el servidor**. Ahí el aislamiento no lo da la
arquitectura: lo tiene que dar la clave con la que se guarda cada cosa.

Y la lista de notas se guardaba con esta clave:

```
grades:list|stu:-|sub:-|per:-|act:-|tch:-|cls:-|min:-|max:-|typ:-|df:-|dt:-|pg:1|lm:10|sb:createdAt|so:desc
```

Los guiones son «sin filtro». O sea: **pedir "todas las notas" produce
exactamente la misma clave en todos los liceos**. El primero que la pedía dejaba
sus notas ahí guardadas, y el siguiente liceo que pidiera lo mismo recibía **las
del primero**.

`GET /api/grades` sin filtros es la petición más normal del mundo. No hacía
falta atacar nada: bastaba con que dos liceos distintos abrieran la misma
pantalla dentro del mismo minuto.

Lo mismo pasaba con:

| Clave | Qué guardaba |
|---|---|
| `grades:stats:{}` | las estadísticas de notas |
| `report:academic:{}` | el informe académico general |
| `students:filters:{}:page:1` | la lista de alumnos (código muerto, ver abajo) |

Y al revés: al guardar una nota se limpiaba `grades:list:*`, que **tiraba lo
guardado de todos los liceos**, no solo del suyo. Eso no filtra nada, pero hace
que cada liceo le tire el trabajo a los demás cada vez que un profesor guarda.

### Por qué el resto se salvaba, y por qué eso no vale

Las demás claves llevan identificadores dentro (`attendance:classroom:<id>`,
`stats:student:<id>`), y los que genera Prisma no se repiten entre bases. Se
salvaban **por suerte**, no por diseño.

Y la suerte se acaba: los liceos que se dan de alta **copiando una base de
ejemplo nacen con los mismos identificadores**. En ese momento
`attendance:classroom:aula-1` es la misma clave en dos liceos distintos. Arreglar
las tres claves malas dejaba el resto colgando de que nadie copie una base.

### Lo que se hizo

El liceo de la petición se apunta al empezar
(`src/config/ambito-del-liceo.ts`) y **la memoria rápida lo pone en la clave
ella sola** (`src/config/redis.ts`). Quien escriba una clave nueva mañana ya no
puede olvidarse del liceo, porque no es él quien lo pone:

```
gestion-escolar:liceo:<id del liceo>:grades:list|stu:-|...
```

Quedan fuera, a propósito, las cuatro familias de claves que **no son de ningún
liceo**: `tenant:` (que es justo lo que se consulta *para averiguar* de qué liceo
es la petición), `institute:info:`, `superadmin:` y `platform:`. Si se metieran
en un apartado, el portal público las escribiría en uno y el superadministrador
las borraría en otro, y el liceo seguiría enseñando su nombre viejo.

### El segundo fallo, debajo del primero

El primer intento **no llegaba**. El liceo se apuntaba dentro de
`identifyTenant`, y lo guardado seguía saliendo en el apartado «sin liceo»: el
apunte no sobrevive al salto entre los ganchos de Fastify. Nada avisa de eso —no
hay error, no hay registro— y la fuga habría seguido viva con el arreglo puesto
y con la sensación de estar arreglada.

Se vio mirando las claves de verdad después de una petición de verdad:

```
gestion-escolar:sin-liceo:grades:list|stu:-|...      ← el arreglo no llegaba
gestion-escolar:liceo:institute:grades:list|stu:-|... ← después
```

La forma que sí llega es abrir el ámbito **en forma de callback** y llamar a
`done()` dentro: así el resto de la petición cuelga de él y el liceo alcanza al
gancho, al controlador y al servicio. Está en `server.ts` con su explicación.

### Y el tercero: el liceo va dicho, no supuesto

Al correr la tanda entera salieron tres pruebas en rojo, y las tres decían lo
mismo por sitios distintos: hay trabajo que ocurre **fuera de la petición** —o en
sus últimos coletazos, al enviar la respuesta— y ahí no hay liceo que heredar.

La más seria la cazó `auditoria-intrusion`: al desactivar una cuenta se borra su
sesión guardada, y ese borrado se hacía desde fuera de la petición. Iba a parar
al apartado «sin liceo», no alcanzaba a lo guardado, y **la cuenta desactivada
seguía entrando** hasta que la copia caducaba sola.

La regla que resuelve las tres: **el que sabe de qué liceo es, lo dice**. Todas
las funciones que ya reciben el liceo lo declaran con `conLiceo(...)` en vez de
confiar en el ambiente:

- `invalidateUserSession` y la sesión guardada (`auth.middleware.ts`)
- las siete funciones de `utils/cache-invalidation.ts`
- el aviso de cambios (`plugins/avisar-cambios.ts`)
- el guardado de pantallas (`middleware/smart-cache.middleware.ts`), que lee al
  empezar y guarda al enviar: dos momentos distintos de la misma petición
- el panel del administrador y sus tres borrados

### Un cuarto sitio con el mismo fallo, sin memoria rápida de por medio

Buscando más estado compartido apareció otro: el aviso de cambios recuerda un
minuto **quién es el personal de cada sección**, en una tabla en memoria con el
identificador de la sección como clave. Misma historia: dos liceos con la misma
sección compartían la lista.

El efecto no era filtrar datos, era peor de explicar: un cambio en el liceo A
avisaba a los profesores del liceo B **y dejaba sin avisar a los del A**, que se
quedaban mirando datos viejos sin que nada fallara. Ahora la clave lleva el liceo
delante.

### Código muerto que era una trampa

`studentsService.findMany` —la lista de alumnos con su clave compartida— **no la
llamaba nadie**: el controlador hace su propia consulta. Estaba ahí, completa,
con aspecto de usarse y con el fallo dentro, esperando a que alguien la
enchufara. Se borró, con lo que solo ella usaba (`buildFilter`, el prefijo y el
tiempo de guardado, y dos interfaces de filtros).

### Prueba

`tests/integration/la-memoria-rapida-no-mezcla-liceos.test.ts`, siete
comprobaciones (MEZCLA-01 a MEZCLA-07). Lo importante de cómo está montada: usa
**dos liceos de verdad, cada uno con su base**, y el segundo nace vacío. Así, si
al pedir sus notas le llegan notas, no hay interpretación posible: no son suyas.

- **MEZCLA-01** es la fuga entera por la ruta de verdad: el liceo A pide sus
  notas, se marca lo que queda guardado, se comprueba que al liceo A **sí** se le
  sirve esa copia (o si no, la prueba no estaría probando nada) y que al liceo B
  **no**.
- **MEZCLA-02**: guardar en un liceo ya no tira lo guardado del otro.
- **MEZCLA-05 y 06**: lo de plataforma sigue siendo de todos, que es lo que tiene
  que pasar.
- **MEZCLA-07**: el liceo llega hasta el servicio. Es la que habría cazado el
  segundo fallo de arriba.

Quitando el arreglo, **cinco de las siete se caen**. Se comprobó a propósito:
una prueba que no puede fallar no prueba nada.

### Lo que esto dice del sistema

El aislamiento por base de datos es sólido y no tuvo nada que ver con esto. Lo
que falló es lo de siempre: **una pieza compartida que nadie contó como
compartida**. Había tres —la memoria rápida, la tabla del personal por sección, y
el momento en que se apunta el liceo— y las tres estaban a la vista.

Vale la pena decirlo claro: esto llevaba meses ahí, con 684 pruebas en verde por
encima. Las pruebas comprueban lo que se les ocurrió comprobar a quien las
escribió, y a nadie se le había ocurrido levantar **dos liceos a la vez**.

---

## 48. PgBouncer: de «está preparado» a «está probado»

En `tenant-db-url.ts` estaba escrito, negro sobre blanco, que la salida para
muchos liceos es PgBouncer y que *«el código ya está preparado (`pgBouncer()`);
falta levantarlo»*.

Una promesa sin comprobar. Y las promesas sin comprobar son justo las que se
rompen el día del despliegue, que es el peor día para descubrirlas.

### Por qué importa

Aquí hay **una base de datos por liceo**. Sin repartidor delante, cada liceo abre
su propio grupo de conexiones y PostgreSQL se queda sin cupo en cuanto hay unas
decenas. Por eso el tope por liceo es **2**: 50 liceos guardados × 2 = 100, justo
el máximo por defecto de PostgreSQL. Ese 2 cuesta 2,6× en la pantalla más pesada
(medido, sección 39). PgBouncer es lo que permite quitarse el 2 sin quedarse sin
conexiones.

### Levantado y comprobado

Se levantó (PgBouncer 1.25.2, modo transacción) y se pasó
`npm run probar:pgbouncer`. **Trece comprobaciones, todas en verde**:

| Qué | Resultado |
|---|---|
| La dirección de uso normal apunta al repartidor | sí |
| Lleva `pgbouncer=true` (sin sentencias preparadas) | sí |
| La de las migraciones **no** pasa por él | sí — Prisma Migrate necesita conexión directa para sus bloqueos |
| Leer a través del repartidor | sí — 632 personas |
| Una consulta cruda (sentencia preparada) | sí — es la que revienta si faltara `pgbouncer=true` |
| Escribir | sí |
| Una transacción entera en la misma conexión real | sí — es lo que el modo transacción tiene que garantizar |

### El número que lo justifica todo

Diez liceos abiertos a la vez, con el tope de 2 conexiones cada uno:

```
sin repartidor:   20 conexiones reales de PostgreSQL
con repartidor:    3 conexiones reales de PostgreSQL
```

Veinte contra tres. Con 200 liceos eso es la diferencia entre un servidor que
arranca y uno que no.

`src/scripts/probar-pgbouncer.ts` deja escrito en su cabecera cómo levantarlo
para volver a pasarlo, sin necesidad del despliegue entero.

---

## 49. Un número medido dos veces que salió al revés

Con PgBouncer ya levantado, tocaba comprobar lo que la sección 39 dejó escrito:
que el tope de conexiones por liceo en **2** cuesta **2,6×** y que conviene
subirlo a 25.

**No se reprodujo.** Ni de lejos, y la conclusión se da la vuelta.

### Las dos preguntas, que no son la misma

Un número de rendimiento sin el método al lado no vale nada, y aquí hay dos
métodos posibles que contestan cosas distintas:

- **Solo la base de datos.** Consultas directas, todas a la vez, sin servidor de
  por medio. Contesta *«¿cuánto estorba el tope de conexiones, por sí solo?»*.
- **Por la API.** Peticiones completas, como las hace una persona. Contesta
  *«¿lo nota alguien?»*, que es la única pregunta que le importa a un liceo.

La sección 39 midió lo primero y recomendó sobre lo segundo. Ahí empezó el error.

### Solo la base de datos

200 consultas a la vez, la lista de alumnos de una sección, contra la base del
liceo de carga (15.000 personas). Tres pasadas seguidas:

| pozo | pasada 1 | pasada 2 | pasada 3 |
|---|---|---|---|
| 2 | 103 ms | 204 ms | 108 ms |
| 5 | 56 ms | 56 ms | 55 ms |
| 10 | 55 ms | 41 ms | 43 ms |
| 25 | 270 ms | 258 ms | 249 ms |

Lo mismo sale contra la base del liceo de pruebas (632 personas), a otra escala.

**El 25 es peor que el 2.** Tiene sentido cuando se mira: son más conexiones que
núcleos tiene la máquina (12), y lo que se gana esperando menos se pierde
peleándose por el procesador. El punto bueno está en **5–10**, no en 25.

### Por la API

50 personas a la vez, tres llamadas cada una, la pantalla más pesada, con el
servidor entero arrancando de nuevo en cada situación:

| Situación | p50 | p95 | Peticiones/s | Conexiones reales |
|---|---|---|---|---|
| pozo 2, sin repartidor | 536 ms | 635 ms | 88 | 24 |
| pozo 25, sin repartidor | 742 ms | 1014 ms | 68 | 47 |
| pozo 25, **con** repartidor | 1202 ms | 1359 ms | 40 | 22 |

**Por la API el pozo no se nota** —y subirlo va peor—. Con una petición completa
el cuello de botella no es esperar una conexión: es el trabajo de responderla.

### Y el repartidor sale lento aquí: por qué eso no cuenta

PgBouncer aparece 2× más lento, y hay que decir por qué **no** es un veredicto
sobre PgBouncer. Se midió el salto de una sola consulta:

```
directo:     p50 0,20 ms
pgbouncer:   p50 1,67 ms
```

1,5 ms de más por consulta, y una pantalla hace varias. Eso no es PgBouncer: es
que aquí corre **en un contenedor de Windows hablando con un PostgreSQL de
fuera**, y ese salto se paga en cada consulta. En un despliegue de verdad los dos
están en la misma red interna del contenedor.

O sea: de esta medición, **el tiempo de PgBouncer no vale** y hay que decirlo. Lo
que sí vale, porque se cuenta y no se cronometra, es lo de la sección 49: diez
liceos pasan de 20 conexiones reales a 3.

### Lo que se cambió

| Dónde | Antes | Ahora |
|---|---|---|
| `tenant-db-url.ts` | tabla vieja y «súbelo a 25» | los dos métodos, con sus números y la fecha |
| `docs/DESPLIEGUE.md` | «1–3 liceos → pon 25, se gana 2,6×» | «déjalo en 2; 5 si hay pocos liceos; **25 nunca**» |
| Sección 39 | la tabla, a secas | la tabla con el aviso de que no se reprodujo |

Y la medición entera en un solo comando, para que la próxima vez no haya que
fiarse de nadie:

```bash
PGBOUNCER_HOST=localhost PGBOUNCER_PORT=6432 npm run medir:pozo
```

### Lo que esto enseña, otra vez

Es la tercera vez en esta auditoría que un número escrito sin su método al lado
manda a alguien en dirección contraria: la causa inventada de las pruebas
inestables (sección 50), los «361 ms» que mezclaban dos formas de medir, y ahora
esto. Un número sin método no es un dato: es una opinión con cifras.

---

## 50. La mañana entera, no dos segundos

Todo lo medido hasta aquí contestaba dos preguntas: *«¿cuánto tarda?»* y
*«¿aguanta un golpe?»*. Faltaba la tercera, que es la que de verdad se nota en un
liceo: **¿aguanta la mañana entera?**

Un sistema puede ir fino el primer minuto y arrastrarse en el trigésimo. Memoria
que se llena y no se suelta, copias guardadas que crecen sin caducar, conexiones
que se abren y no se cierran: nada de eso sale en una ráfaga de dos segundos.

### Cómo se montó

**Con personas distintas de verdad.** El sistema limita a 200 peticiones por
minuto y por persona, y eso no se toca para medir: es lo que frena a quien abusa.
Así que se entra con **treinta personas del liceo** —profesores y alumnos— y cada
una pide **su** pantalla, una cada medio segundo. Ninguna se acerca a su tope, la
carga es real, y de paso se pasa por caminos distintos del sistema.

Veinte minutos seguidos, `npm run medir:aguante`.

### Lo que salió

```
    minuto      p50      p95     peor   por seg   fallos   memoria   conex.
         1      3ms     11ms     97ms        57        0     220MB        3
         5      2ms      8ms     22ms        57        0     221MB        3
        10      3ms      8ms     25ms        57        0     222MB        3
        15      3ms     10ms     44ms        57        0     223MB        3
        20      3ms     11ms     29ms        57        0     223MB        3

    68.416 peticiones, 0 fallos, 29 credenciales renovadas por el camino
```

- **Ni un fallo** en 68.416 peticiones.
- **No se arrastra**: el p95 del minuto veinte (11 ms) es el mismo que el del
  minuto uno (11 ms).
- **No se llena**: la memoria pasa de 220 a 223 MB en veinte minutos. Tres
  megas. Si hubiera una fuga, aquí se vería subir y no bajar.
- **No se escapan conexiones**: tres contra la base, de principio a fin.

### Y de paso, algo que no se había probado nunca

La primera corrida **falló**: setenta peticiones en rojo, todas en el minuto
quince. Justo quince. La credencial corta vale quince minutos.

No era un fallo del sistema: era la medición comportándose como ningún cliente de
verdad se comporta. La pantalla renueva sola cuando le caduca
(`conseguirCredencial`), y la medición no lo hacía.

Con la renovación puesta, el resultado de arriba: **29 credenciales renovadas por
el camino y cero fallos**. Eso comprueba algo que ninguna otra prueba tocaba —que
una sesión que dura **más que su credencial** sigue funcionando sin que la persona
se entere de nada— y lo comprueba bajo carga y con treinta sesiones renovando casi
a la vez, que es justo cuando el cupo de renovaciones mal repartido (sección 42)
habría echado a todo el liceo a la calle.

### Lo que esta medida sigue sin ser

El generador corre en la misma máquina que el servidor y que PostgreSQL. Los 57
por segundo son de aquí, no de un servidor de verdad, y con el generador en otro
equipo saldrían más. Lo que **sí** vale, y es lo que se venía a ver, es la forma
de la curva: **el minuto veinte es igual que el primero**. Eso no lo cambia la
máquina.

---

## 51. Las puertas que nadie había empujado

Hasta aquí, las pruebas comprobaban **lo que se le había ocurrido comprobar a
quien las escribió**. `auditoria-permisos` recorría las reglas del liceo por las
puertas que conocía, y las conocía bien. El problema son las otras.

Así que se hizo lo que no se había hecho nunca: **recorrer las rutas del
servidor una por una**, cruzando `routes/` con `controllers/`, buscando el patrón
«la ruta pregunta quién eres y nadie pregunta después si puedes».

Aparecieron seis. Y con 715 pruebas en verde por encima.

### Lo que un ALUMNO podía hacer con su sesión normal

| Ruta | Lo que le dejaba hacer |
|---|---|
| `POST /api/classrooms/:id/students` | meter a cualquier compañero en cualquier sección |
| `DELETE /api/classrooms/:id/students/:sid` | **sacar** a cualquier compañero de su sección |
| `POST /api/evaluation-plan/metadata` | reescribir la cabecera del plan de cualquier clase: nombre del profesor, su cédula, su teléfono y su correo |
| `GET /api/attendance/classroom/:id` | leer la asistencia completa de una sección entera |

El de sacar alumnos tiene su gracia amarga: el controlador **sí** pedía una
contraseña de confirmación… **la de quien llama**. Un alumno la tiene. Lo que no
tenía era el permiso, y eso no se preguntaba en ningún sitio.

Y el del plan de evaluación es el mismo fallo partido por la mitad: las **filas**
del plan sí comprobaban quién escribe; la **cabecera**, no. La misma pantalla,
dos funciones, una con cerradura y otra sin ella.

### Lo que un PROFESOR podía hacer fuera de sus clases

| Ruta | Lo que le dejaba hacer |
|---|---|
| `PUT /api/grades/:id` | cambiar la nota de cualquier alumno del liceo, en cualquier materia |
| `DELETE /api/grades/:id` | **borrar** esa nota |

Poner una nota sí se comprobaba. Cambiarla y borrarla, no. En la prueba, el
profesor B **borró de verdad** la nota que el profesor A había puesto en una
clase que B no imparte — se notó porque la prueba siguiente, la del profesor que
sí la imparte, empezó a responder «esa nota no existe».

### Y lo del representante

`GET /api/attendance/student/:id` solo frenaba a un alumno mirando la de otro. Al
representante no se le preguntaba nada: con el identificador de cualquier alumno
del liceo leía su asistencia completa, aunque no lo representara. La regla del
liceo es que **el tutor solo ve a los alumnos que tutela**.

### Cómo se cerraron

Ninguna pieza nueva: las comprobaciones ya existían y se usaban en otras rutas.
Lo que faltaba era llamarlas.

| Dónde | Qué se puso |
|---|---|
| `classrooms.routes.ts` | `requireTeacher` en inscribir y desinscribir |
| `evaluation-plan.controller.ts` | `assertClassroomScope`, la misma que usan las filas del plan |
| `grades.controller.ts` | `soloSiEsDeSuClase()` en cambiar y borrar: la sección de una nota está en su actividad, así que hay que traerla para poder preguntar |
| `attendance.routes.ts` | `assertClassroomScope` en la asistencia de una sección |
| `attendance.controller.ts` | `canSeeStudent`, la misma pregunta que usa el resto del sistema |

Un detalle que costó un rato: al poner `requireTeacher` en la ruta, el
administrador empezó a recibir **401**. Los guardias se adelantan a `onRequest`
(ver `middleware/guardias.ts`), así que el guardia corría **antes** de que nadie
hubiera preguntado quién llama. Se arregla poniendo `authenticate` también en la
lista de la ruta, como ya hacían las demás.

### Prueba

`tests/integration/puertas-sin-cerradura.test.ts`, diez comprobaciones
(PUERTA-01 a PUERTA-10). **Antes del arreglo, siete devolvían 200** —o sea,
«adelante»—. Ahora todas devuelven 401 o 403, y las dos de contrapeso siguen en
verde: el profesor que **sí** imparte la materia puede cambiar la nota, y el
representante **sí** ve a su propio representado. Una cerradura que no deja
entrar a nadie no es una cerradura, es una pared.

### Una prueba que se apoyaba en algo imposible

Al cerrar lo de las notas se cayó `RES-06`, la de dos personas corrigiendo la
misma nota a la vez. Su montaje decía en un comentario que «los dos profesores
imparten la misma materia en la sección»… y eso **no puede pasar**: el esquema
tiene `@@unique([classroomId, subjectId])`, una materia en una sección tiene un
profesor. El comentario describía algo que el código nunca hizo.

Daba igual mientras nadie comprobaba de quién es la clase. Ahora el segundo
profesor recibe un 403 con razón. La prueba se rehizo con las dos personas que
de verdad pueden tocar esa nota —el profesor de la materia y el administrador—,
que además es el caso real en un liceo.

---

## 52. La papelera llegaba hasta la primera fila

`docs/CLAUDE.md` lo promete en mayúsculas: **nada se borra de verdad**. Y era
cierto… para la fila que se nombra.

PostgreSQL borra **en cascada**. Al borrar una materia se van con ella todas sus
notas, su plan de evaluación, sus horarios y sus sesiones de clase. Ninguna de
esas filas pasaba por la papelera. Quedaba la materia sola, y de las notas de
todos sus alumnos, nada.

O sea: la promesa se cumplía justo para lo que menos duele perder.

### Y una materia no llegaba ni a eso

`subjectsService.deleteSubject` hacía `prisma.subject.delete()` a pelo, **sin
papelera ninguna**. Un clic por error en «eliminar materia» borraba las notas de
todos los alumnos que la cursan y no quedaba copia de nada: lo único que había
era el respaldo de anoche, que al restaurarlo borra todo lo que el liceo hizo hoy.

### Lo que se hizo

No se arreglaron las llamadas una a una: se arregló **la papelera**, que es la
que tenía el agujero.

Ahora recorre el mapa de relaciones del propio esquema —44 relaciones en cascada,
9 tablas que arrastran a otras— y copia **todo lo que la cascada va a llevarse**,
hasta el último nivel, antes de tocar nada. Una tabla nueva con borrado en
cascada queda cubierta el día que se añade, sin que nadie se acuerde de esto.

Y se mantiene la regla de siempre, ahora también para los hijos: **si la copia no
se puede guardar, el borrado no ocurre**.

### El tope, y por qué existe

Copiar tiene un límite razonable. Borrar un año escolar entero puede arrastrar
cientos de miles de filas, y meterlas todas en la papelera no es lo que la
papelera viene a resolver —para eso está el respaldo—. Si un borrado pasa de
`PAPELERA_MAX_FILAS` (20.000 por defecto, configurable), **no se borra nada** y
se dice por qué, con el comando del respaldo en el mensaje.

Es la misma decisión que ya se había tomado para borrar un liceo entero: sin
respaldo, no se borra.

### Prueba

`tests/integration/la-papelera-alcanza-a-la-cascada.test.ts`, seis
comprobaciones:

- **CASCADA-01**: se borra una materia con notas de tres alumnos; las notas
  desaparecen de la base —la cascada hace su trabajo— y **están las tres en la
  papelera**.
- **CASCADA-02**: la copia guarda la nota entera (su valor, su alumno), no solo
  el identificador, y con el nombre de tabla por el que se busca al restaurar.
- **CASCADA-03**: alcanza a los **nietos**. Se borra un año escolar: se va su
  sección, y con la sección su asistencia. La asistencia no cuelga del año, y es
  justo la que nadie estaba copiando.
- **CASCADA-04**: con el tope en 1, el borrado **no ocurre** y todo sigue en su
  sitio.
- **CASCADA-05**: el tope se configura, no está fijo en el código.
- **CASCADA-06**: las sesiones y los avisos siguen fuera, a propósito.

---

## 53. Dos números que decían hacerse y no se hacían

Los dos son de la misma familia: nada falla, nadie ve un error, y lo que sale por
pantalla no es lo que dice ser. Son los peores, porque no hay nada que investigar
hasta que alguien hace la cuenta a mano.

### 1. El promedio del lapso del alumno estaba mal

El panel del alumno armaba el promedio de cada lapso recorriendo **las filas de
notas**: por cada nota pedía el promedio de esa materia y lo metía en la lista.
Una materia con cinco evaluaciones metía **cinco veces el mismo número**; una con
una, solo una.

Al promediar esa lista, las materias con más evaluaciones pesan más. Con dos
materias —Lengua en 20 con tres notas, Matemática en 10 con una—:

```
    lo que la regla dice:  (20 + 10) / 2      = 15
    lo que salía:          (20+20+20+10) / 4  = 17,5
```

Se midió corriendo la prueba contra el código viejo: **17,5**. Contra el
arreglado: **15**.

La regla lleva escrita desde el principio en `docs/MAPA_DE_CALCULOS.md`: cada
nivel es la media de las **entidades** del nivel de abajo —una materia, una
vez—, no de sus filas. Anotado allí como hallazgo 5.

De paso, se pedían las notas de **todos los años** del alumno y se calculaba una
por una para tirar después las que no eran de este año. Ahora se piden solo las
del año en curso y se calcula una vez por materia y lapso, en paralelo.

### 2. El botón de limpiar la caché de estadísticas no limpiaba nada

Borraba `stats:section:<id>:global`. Lo que se guarda es
`stats:section:<id>:global:min10:asis80` — con la nota mínima y la asistencia
mínima del instituto pegadas al final, porque el mismo dato con otra nota mínima
es otro dato.

**No coincidía ninguna clave.** El botón respondía «listo» y no limpiaba nada, y
las estadísticas de la sección seguían enseñando los números viejos hasta que
caducaban solas. Nadie lo notaba, porque el botón no miente: dice que lo hizo.

Y el de limpiar el ciclo recorría los grados **del 1 al 5 a mano**: un liceo con
sexto año tenía una caché que no se limpiaba nunca.

Ahora se borra por patrón, que coge la clave completa exista lo que exista detrás.

### Prueba

`tests/integration/decia-hacerlo-y-no-lo-hacia.test.ts`: `NUM-01` comprueba los
**dos** números (que sale 15 y que **no** sale 17,5 — una prueba que solo mira el
resultado bueno no distingue un arreglo de una casualidad); `NUM-02` y `NUM-03`
guardan con la clave de verdad, llaman al botón y comprueban que ya no está.

---

## 54. Cuánto falta

| Parte | Peso | Estado | Aporta |
|---|---|---|---|
| API cubierta por pruebas | 30% | **278 de 278 acciones (100%)**: no queda ninguna sin que alguien la haya llamado. Y desde la sección 51, **ninguna sin que alguien haya comprobado quién puede llamarla** | 30% |
| Permisos y seguridad de acceso | 20% | Fuerza bruta cerrada por cuenta; la credencial fuera del alcance del navegador; ya no se puede mentir sobre la dirección desde la que se llama; **la memoria rápida ya no mezcla liceos** (sección 47); y **las seis puertas que solo preguntaban «quién eres» ya preguntan también «¿y puedes?»** (sección 51) | 20% |
| Exactitud de cálculos | 15% | **El mapa de cálculos está vigilado**: doce pruebas (MAPA-01 a MAPA-12) comprueban sus reglas contra el sistema. Y el promedio del lapso del alumno, que salía **17,5 donde la regla da 15**, ya sale bien y tiene su prueba (sección 53) | 15% |
| Interfaz probada de verdad | 15% | **37 pantallas, ninguna sin prueba**, y seis pruebas que **pulsan los botones de verdad** en vez de llamar a la API por dentro. 154 en verde, y la última que dependía del reloj ya espera al resultado | 15% |
| Resistencia a fallos | 10% | Doble clic, edición simultánea, guardados a medias, datos incompletos, Redis cayéndose sin que nada se abra, la base de un liceo caída sin arrastrar a los demás, y **la papelera alcanzando por fin a lo que se lleva la cascada** (sección 52) | 10% |
| Rendimiento | 5% | Medido de punta a punta; el guardado de notas, 13× más rápido; **el pozo remedido y la recomendación corregida** (sección 49); y **veinte minutos seguidos con treinta personas: 68.416 peticiones, cero fallos, sin arrastrarse ni llenarse** (sección 50). Falta la corrida con el generador en otro equipo | 4% |
| Despliegue y operación | 5% | Respaldos probados; **el repartidor con cifrado levantado y comprobado de verdad** (redirección, HSTS, tiempo real y dirección de origen); **PgBouncer levantado y comprobado**, ya no es una promesa (sección 48); faltan los respaldos fuera del servidor | 4% |

**Total: ~98% verificado. Falta ~2%.**

**715 pruebas de servidor (75 archivos) y 154 de navegador, todas en verde**, y
sin ninguna prueba inestable pendiente.

### Lo que enseñó el último barrido, y que conviene no olvidar

Las secciones 47 y 51 a 53 salieron **todas** de lo mismo: dejar de preguntarle a
las pruebas y ponerse a leer el código de una en una, cruzando lo que la ruta
promete con lo que el controlador hace.

Y lo que apareció no era menor: una fuga de datos entre liceos, seis puertas
abiertas, una papelera que llegaba hasta la primera fila y dos números que salían
mal en pantalla. Todo eso convivía con **696 pruebas en verde**.

Las pruebas no dicen que el sistema esté bien. Dicen que **lo que a alguien se le
ocurrió comprobar** está bien. La diferencia entre las dos frases es justo el
tamaño de lo que apareció aquí.

### Las tres cosas que faltan, y por qué no se pueden hacer desde aquí

**1. La corrida de rendimiento con el generador en otra máquina (1%).**
Lo que hay medido son los tiempos del servidor, que es lo que nota quien usa el
sistema, y están todos por debajo de 35 ms. Lo que falta es el comportamiento
bajo carga real y sostenida, y **para eso hace falta un segundo equipo**: en este,
el generador le quita procesador al servidor y a la base, y lo que sale es el PC.

**2. Conseguir los certificados del dominio de verdad (1%).**
El repartidor con cifrado ya se levantó y se comprobó punto por punto (sección
43), pero con un certificado de usar y tirar. Lo que falta es pedir los del
dominio real y dejarlos en `docker/nginx/certs/`. Los pasos están en
`docs/DESPLIEGUE.md` §5-bis.

**3. Sacar los respaldos del servidor (1%).**
Hoy se respalda cada liceo y se prueba la restauración, pero los respaldos viven
en la misma máquina. Si se quema, se queman con ella. Es tarea de despliegue, no
de código.

**Las tres son de fuera: una necesita otro equipo, otra el dominio de verdad, y
la tercera un sitio donde guardar los respaldos. Ninguna es código sin
escribir.**

De los dos casos de resistencia que faltaban, **uno ya está**: la base de un
liceo caída (CAIDA-BD-01 a CAIDA-BD-05) — responde con un error en vez de
colgarse, no cuenta la contraseña de la base al fallar, y **el liceo de al lado
sigue funcionando**. Queda el disco lleno, que no se puede simular de forma
fiable sin tocar la máquina.

### Las pruebas inestables: causa encontrada

Tres pruebas (`PAP-01`, `ACT-05`, `NOT-01`) fallaban **una de cada cinco o seis
tandas completas** y pasaban siempre al correr su archivo a solas. Llevaban meses
así, y la explicación anotada era: *"el pozo de conexiones por liceo en 2: bajo
pruebas en paralelo, una escritura se queda sin conexión"*.

**Esa explicación era falsa por partida doble.** `jest.config.js` tiene
`maxWorkers: 1`: las pruebas corren una detrás de otra, **nunca en paralelo**. Y
el pozo no tenía nada que ver.

**Lo que era.** Se dejó corriendo la tanda completa en bucle hasta que fallara,
capturando la respuesta. Cayó a la primera y con el error a la vista:

```
GET /api/grades/subject/<id>  →  400 Bad Request
```

Un **400**, no un fallo de base de datos. El validador del sistema exige que un
identificador tenga la forma `c` + 24 caracteres (25 en total), que es la que
genera Prisma. Y el ayudante de las pruebas hacía esto:

```js
const id = createId();                          // cuid2: 24 caracteres
return id.startsWith('c') ? id : `c${id}`;      // ← aquí
```

Cuando el identificador **ya empezaba por 'c'**, no se le añadía nada y se
quedaba en 24 caracteres: **inválido**. Y cuid2 empieza por 'c' un **3,9%** de
las veces (medido: 773 de 20.000).

O sea: cada entidad que creaba una prueba tenía una posibilidad entre veintiséis
de nacer con un identificador que el sistema rechaza. Con muchas entidades por
tanda, eso sale más o menos una vez cada cinco o seis tandas — **y cae en una
prueba distinta cada vez**, que es lo que hacía tan difícil verlo.

Corregido en los 28 archivos que lo copiaban: la 'c' se antepone **siempre**.

**Lo que esto enseña.** El fallo no estaba en el sistema: estaba en las pruebas,
y el sistema hacía bien en rechazar un identificador con formato inválido. Pero
durante meses hubo una causa inventada escrita en un documento, y eso **cerró la
investigación**: nadie vuelve a mirar algo que ya tiene explicación. Un "no lo
sé" honesto habría durado menos.
