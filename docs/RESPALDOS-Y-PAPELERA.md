# Respaldo en Google Drive y papelera con plazo

Cristian (19-oct-2026) pidió dos cosas:

- **Borrar es borrar.** Lo que el admin borra no puede quedarse guardado para siempre, pero un borrado sin querer (un alumno, una clase, lo que sea) se tiene que poder devolver, con un límite.
- **Una copia de seguridad del admin en Google Drive.** Quiere saber los riesgos, cómo se haría, cuánto ocuparía con 10 ciclos y miles de usuarios, y si sale viable.

## La respuesta corta

**Son dos problemas distintos, y no se arreglan con lo mismo.**

| | Para qué sirve | Con qué se arregla |
|---|---|---|
| «Borré un alumno sin querer» | deshacer un error de hace minutos o días, sin tocar el trabajo de nadie más | **la papelera con «Restaurar»**, dentro de Gestiedu |
| «Se quemó el servidor» o «el liceo se va de Gestiedu» | tener los datos del liceo fuera de nuestras manos | **la copia en Drive**, cifrada |

Recuperar un alumno desde una copia en Drive obligaría a volver el liceo entero al estado de esa noche. Se perdería lo que hicieron todos los profesores desde entonces. Por eso **Drive nunca se usa para deshacer**.

**Veredicto: las dos son viables.**

- **Primero la papelera:** barata, protege a diario y cumple la regla de «borrar es borrar».
- **Después Drive:** es viable en espacio y en coste, con tres condiciones:
  1. la copia va **cifrada** (son datos de menores);
  2. se usa el permiso **`drive.file`** de Google;
  3. va **en una cuenta del liceo**, no en la personal del admin.

## 1. Lo que hay hoy (medido)

**Al borrar:**

- Todo borrado pasa por `borrarGuardandoCopia()`: la fila entera y lo que arrastra en cascada van a `registros_borrados`.
- La tarea diaria tira esa papelera a los **90 días** (`PAPELERA_DIAS`).
- **No hay ninguna pantalla para restaurar.** La copia existe, pero solo un programador la puede devolver.
- **Borrar un alumno** borra, con copia, sus notas, su asistencia, sus inscripciones, sus representantes, sus observaciones y su expediente (`controllers/usuarios/archivar-y-borrar.controller.ts`).

**Los respaldos:**

- Cada noche se respalda la plataforma y cada liceo (`pg_dump`).
- Si se configura una copia fuera del servidor (R2), sale cifrada con la llave pública del dueño (`RESPALDO_LLAVE_PUBLICA`).

**El tamaño real.** Se midió el liceo de pruebas el 19-oct-2026: 600 alumnos, 30 profesores, 1 ciclo a medias.

| Qué | Tamaño |
|---|---|
| El esquema entero en la base | 147 MB |
| … de eso, lo que se rehace solo (la descarga, las sesiones) | 116 MB |
| … los datos de verdad, con sus índices | ~30 MB |
| **El respaldo comprimido (`pg_dump -Fc`), sin lo que se rehace** | **1,6 MB** |

El liceo de pruebas tiene solo 8.656 notas y 6.751 asistencias: un ciclo a medias y poco cargado.

## 2. Cuánto ocuparía con 10 ciclos

**Un ciclo real de un liceo de 600 alumnos:**

- **Notas:** 12 materias × 3 lapsos × unas 5 evaluaciones = 180 por alumno, unas **108.000 al año**.
- **Asistencia:** una fila por alumno y día (`daily_attendance` va por sección), unas 180 por alumno, otras **108.000 al año**.
- **Lo demás:** plan, actividades, observaciones, pagos, cuadro de honor… unas **35.000 al año**.

En total, unas **250.000 filas al año**: cinco veces lo que tiene hoy el liceo de pruebas. El respaldo comprimido crece en proporción.

| Liceo | 1 ciclo | 10 ciclos |
|---|---|---|
| 600 alumnos: respaldo de la base | ~8 MB | **~80 MB** |
| 600 alumnos: archivos (fotos de perfil, facturas, comprobantes, logos) | ~40 MB | ~400 MB |
| **600 alumnos en total** | ~50 MB | **~0,5 GB** |
| 2.000 alumnos: base | ~27 MB | ~270 MB |
| 2.000 alumnos: archivos | ~130 MB | ~1,3 GB |
| **2.000 alumnos en total** | ~160 MB | **~1,6 GB** |

Los archivos son lo que más pesa, pero no cambian: se suben una vez y no se repiten en cada copia.

**Cuántas copias se guardan:** 7 diarias, 4 semanales y 6 mensuales (17 copias de la base) más los archivos una sola vez. En el año 10:

| Liceo | Ocupa en Drive |
|---|---|
| 600 alumnos | 17 × 80 MB + 400 MB = **~1,8 GB** |
| 2.000 alumnos | 17 × 270 MB + 1,3 GB = **~5,9 GB** |

Google da **15 GB gratis por cuenta**, compartidos con Gmail y Fotos. Así que cabe, pero no conviene la cuenta personal del admin. Con una cuenta propia del liceo sobra espacio hasta para 2.000 alumnos y 10 ciclos. Si se llenara, Google One de 100 GB cuesta unos 2 USD al mes y lo paga el liceo.

**En nuestro servidor, a escala nacional** (2.000 liceos):

- **Carga:** cada noche salen entre 16 y 60 GB hacia Google. Se hace con una cola y un liceo a la vez, cediendo ante la gente (regla 0 de CLAUDE.md), como los cubos.
- **Envío incremental:** la base completa solo una vez por semana y, las otras noches, solo lo que cambió. Eso reduce lo que sale a menos de la décima parte.

## 3. Los riesgos de Drive y cómo se cubren

1. **Datos de menores fuera de nuestro control.**
   - **Riesgo:** si roban o descuidan la cuenta de Google del admin, se va el liceo entero: cédulas, notas, observaciones de conducta.
   - **Cómo se cubre:** la copia sube **cifrada**. En Drive solo hay un archivo ilegible.
   - **El nuevo riesgo:** perder la llave deja la copia inservible.
   - **La respuesta:** una **hoja de recuperación** impresa que el liceo guarda en su caja fuerte, como hace Bitwarden con su kit de emergencia. Y una segunda llave guardada por Gestiedu, para que un admin que se va no se lleve la única.
2. **El permiso de Google.**
   - **Qué se pide:** con **`drive.file`** la app solo ve los archivos que ella misma crea: no puede leer el resto del Drive del liceo.
   - **Lo que exige Google:** Google lo trata como permiso **no sensible**: sin la auditoría de seguridad de pago que exigen los permisos amplios. Basta la verificación básica de la pantalla de permisos.
   - **Lo que no conviene:** pedir el Drive entero (`drive`) sería un permiso **restringido**, con auditoría anual de pago.
3. **La autorización caduca sola.**
   - **En modo de pruebas:** las llaves de Google **caducan a los 7 días**. La copia dejaría de subirse a la semana sin avisar.
   - **En producción:** solo caducan si no se usan en 6 meses o si el admin la quita.
   - **Lo que hace falta:** pasar la app a producción, y que el panel de Salud enseñe por liceo «última copia en Drive: hace N horas», en rojo si pasan de 2 días.
4. **Quién es el dueño de la cuenta.**
   - **Riesgo:** si es la cuenta personal de un admin que se va, se lleva las copias.
   - **Recomendación:** una cuenta del liceo, como `respaldos@liceo…`, conectada por el director.
5. **Una copia de PostgreSQL no la lee nadie sin Gestiedu.**
   - **El hueco:** si Gestiedu desaparece, el liceo tiene un archivo que no sabe abrir.
   - **Lo que se añade:** junto a la copia, una carpeta **legible**: por ciclo, Excel de notas y asistencia, y los PDF de boletas y resúmenes finales. Eso es lo que el liceo puede usar sin nosotros.
6. **Restaurar desde Drive pisa el trabajo de todos.**
   - **La regla:** solo se restaura en un liceo nuevo o vacío, nunca encima, igual que `restore:tenant` hoy.
   - **Lo que no es:** no es un botón para el admin; es para desastres y lo hace el superadmin.
7. **Lo borrado sigue dentro de las copias.**
   - **El hecho:** un alumno borrado sigue en las copias hasta que caduca la última que lo tenía (6 meses con 6 mensuales).
   - **Por qué es aceptable:** es lo normal en cualquier sistema (Google dice lo mismo de sus copias) y está cifrado.
   - **Lo que se le dice al admin:** «Se borró de Gestiedu. Desaparece de las copias de seguridad el 19 de abril de 2027».

## 4. La papelera con plazo (lo primero que se hace)

Como «Eliminados recientemente» de las Fotos del iPhone o la papelera de Gmail.

**Qué ve el admin:** Configuración → **Papelera**, en filas de 20 en 20 (la regla de las listas). Cada fila dice qué se borró, quién lo borró y cuándo, «se borra para siempre en N días» y dos botones: **Restaurar** y **Borrar para siempre**.

**El plazo:**

- 30 días por defecto.
- El liceo lo cambia entre 7 y 90 en Configuración. Es una regla del liceo, no del código.
- Pasado el plazo, la tarea diaria lo borra de la base (ya existe: solo cambia el número).

**Restaurar un borrado de verdad.** «Restaurar» devuelve todo lo que se llevó la cascada. Un alumno vuelve con sus notas, su asistencia, su sección, sus representantes y sus observaciones. Se hace en una sola transacción, de padres a hijos (la papelera ya guarda la cascada entera). Tres casos piden cuidado:

| Caso | Qué pasa |
|---|---|
| Lo que colgaba ya no está (se borró su sección después) | Se ofrece restaurar también la sección; si no, no se restaura nada, y se dice por qué |
| Ya existe otro igual (se volvió a crear el alumno con la misma cédula) | 409: «ya hay un alumno con esa cédula». Nunca se pisa a nadie |
| El ciclo ya se cerró | Se restaura para verlo, sin reabrir el cierre (las reglas de `CICLO_CERRADO`) |

**Quién puede:**

- Solo el admin, y queda en el registro: quién restauró qué.
- El profesor no ve la papelera. Lo suyo se deshace donde ya se hace: la actividad borrada con notas, «Por decidir».

**Pruebas:**

- **PAPELERA-01:** borrar un alumno y restaurarlo devuelve lo mismo, tabla por tabla.
- **PAPELERA-02:** pasado el plazo, ya no está en la base.
- **PAPELERA-03:** los dos casos de la tabla (lo que colgaba ya no está, y ya existe otro igual).
- **PAPELERA-UI-01:** el admin restaura desde la pantalla.

## 5. Plan y coste

| Paso | Qué | Tiempo |
|---|---|---|
| 1 | Papelera con plazo, pantalla de Restaurar y «Borrar para siempre», con sus pruebas | 3–4 días |
| 2 | Avisar al borrar: «Puedes restaurarlo hasta el …» | dentro del 1 |
| 3 | Copia cifrada en Drive (`drive.file`, cuenta del liceo, cola nocturna, completa semanal e incremental diaria) | 1 semana |
| 4 | La carpeta legible (Excel y PDF por ciclo) | 3–4 días |
| 5 | Verificación de la app en Google (pantalla de permisos, política de privacidad, dominio) | días de espera de Google, poco trabajo |
| 6 | Salud: «última copia en Drive» por liceo, en rojo con más de 2 días | 1 día |

**El paso 1 entra en la puerta 2 del piloto** («no se pierde nada»), así que va antes del piloto. **Drive (pasos 3–6)** conviene antes del piloto si el liceo lo pide; si no, justo después, porque las copias del servidor ya existen.

## Fuentes

- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth): los niveles de permisos y `drive.file`.
- [Google Workspace: enhancing security controls for Drive third-party apps](https://workspace.google.com/blog/product-announcements/enhancing-security-controls-for-google-drive-third-party-apps?e=48754805): `drive.file` sin la auditoría de los permisos restringidos.
- [Set up Google Cloud and OAuth](https://developers.google.com/health/setup): las llaves en modo de pruebas caducan a los 7 días.
- [Why Google OAuth returns invalid_grant (unified.to)](https://unified.to/blog/why_google_oauth_returns): la caducidad a los 6 meses sin uso y el tope de 100 llaves por cuenta.
