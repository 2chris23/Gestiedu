# La app del teléfono

Hay **dos formas** de tener Gestiedu en un teléfono, y las dos salen de la misma
web. No compiten: la segunda se apoya en la primera.

| | Instalar desde el navegador (PWA) | La APK (Capacitor) |
|---|---|---|
| Cómo llega a la gente | Se abre el portal del liceo y se pulsa «Instalar» | Se le pasa el archivo, o se baja de Google Play |
| Icono propio en el teléfono | Sí | Sí |
| Se abre sin barra del navegador | Sí | Sí |
| Avisos al teléfono | Flojos en iPhone | Normales |
| Cámara para el QR de asistencia | Limitada | Completa |
| Bajar un comprobante | Como en el navegador | Va a «Descargas» del teléfono |
| Google Play | No | Sí |
| Hay que actualizarla | Nunca (es la web) | Solo si cambia el envoltorio |
| Sin señal, enseña lo último descargado | Sí | Sí |
| Entrar con la huella | No | Sí |

**Las dos enseñan la web que vive en el servidor del liceo.** Eso es a propósito:
el liceo corrige una nota y se ve en el acto, sin que nadie tenga que actualizar
nada desde una tienda.

---

## Sin señal

**Se mira, no se toca.** El teléfono guarda lo último que se descargó y sin
conexión lo enseña, con un aviso arriba de que es lo de antes. Guardar,
corregir o borrar siguen necesitando internet, y se dice en el acto.

No se deja nada «pendiente de enviar». Suena bien y no lo es: media hora
después se mandaría una nota sobre datos que mientras tanto ha tocado otro
profesor, y nadie se entera.

- **Los datos**, en `lib/lo-guardado-en-el-telefono.ts` (IndexedDB). La llave
  lleva **el liceo y la cédula** de quien los descargó: un teléfono que se
  presta no enseña lo del anterior. Se borran al cerrar sesión y caducan a los
  siete días.
- **La app en sí**, en `public/sw.js`. Ahí solo vive la cáscara —la página, el
  javascript y los estilos—, que es igual para todo el mundo, y es lo que hace
  que la app ABRA sin internet. Los datos del liceo NO pasan por ahí, y el
  motivo no es técnico: lo que guarda un service worker es del navegador, no de
  la persona.
- Sin nada guardado todavía, se ve la pantalla propia («No hay conexión») en
  vez del error del navegador.

**Sin servidor es lo mismo que sin señal.** El caso real es el teléfono con
datos y el servidor apagado o reiniciándose. La app lo detecta (no solo mira
si hay red), enseña lo guardado con el aviso y la hora («lo que ves es de hoy
a las 07:45»), no cierra la sesión y, al guardar, dice que falta conexión.
Cuando el servidor vuelve, el aviso se va solo y lo de la pantalla se renueva.
Comprobado apagando el servidor de verdad: `tests/e2e/servidor-apagado.spec.ts`.

> **Dos casos, y en pruebas solo funciona uno.**
>
> - **Con la app abierta** cuando se va el servidor: sigue todo a la vista,
>   con el aviso. Funciona también en una APK de pruebas por `http`
>   (APAGADO-02).
> - **Abrir la app con el servidor ya apagado** necesita al ayudante, y los
>   navegadores solo lo registran por **https** o en `localhost`. Con el
>   servidor del liceo (https) funciona (APAGADO-01). En una APK de pruebas
>   que apunta a la IP del ordenador por `http`, no: sale «No hay conexión».
>   Y contra el servidor de **desarrollo** tampoco, porque Next en desarrollo
>   no arranca sin su servidor: para probarlo, `npm run telefono:compilado`.

---

## Entrar con la huella

**La huella no entra al sistema.** Abre un cajón del propio teléfono —el
almacén de claves de Android, el respaldado por hardware— donde ese teléfono
guardó una llave, y esa llave es la que se canjea por una sesión.

Por eso la regla se mantiene entera: **la primera vez en un teléfono se entra
siempre con correo y contraseña**. Después, desde *Mi cuenta → Entrar con la
huella*, ese teléfono guarda su llave; y en la pantalla de entrar sale el botón.

Lo que la hace segura:

- en la base se guarda **solo el resumen** (SHA-256): quien se lleve la base no
  se lleva ninguna llave;
- **se cambia en cada uso**, así que una copia robada deja de valer en cuanto
  su dueño abre la app;
- caduca a los 60 días y **se anula al cerrar sesión**;
- entrar con ella lleva el mismo freno de intentos que el login;
- si no vale, se responde lo mismo que a una contraseña mala, sin decir por qué.

Solo en la APK (`capacitor-native-biometric`). En un navegador no se ofrece: no
hay dónde guardar algo así detrás de una huella, y fingirlo sería peor.

---

## 1. Instalar desde el navegador

No hay nada que hacer: ya funciona. Lo que lo hace posible vive en `apps/web`:

- `src/app/manifest.webmanifest/route.ts` — la ficha, **por liceo**: nombre,
  color, icono y por qué pantalla abre. El liceo se saca de la dirección
  (`?liceo=`), de la cookie, del subdominio o de la cabecera.
- `public/icons/*` — los iconos de la plataforma, para el liceo que no tenga
  logo propio.
- `GET /api/institutes/current/icono?tam=512&liceo=<liceo>` — el icono del
  liceo: su logo redibujado en cuadrado sobre su color. Un logo apaisado puesto
  tal cual lo estira el teléfono o le come los bordes al recortarlo.
- `public/sw.js` — el ayudante. Sin uno, el navegador **no ofrece instalar**.
  El nuestro no guarda copias de datos del liceo a propósito: un ayudante que
  sirve copias es la forma más fácil de que alguien vea la nota de ayer.

Se comprueba en `tests/e2e/app-del-telefono.spec.ts` (APP-01 … APP-03).

> El botón «Instalar» solo sale por **https**. En `localhost` sale también; en
> un servidor sin certificado, no.

---

## 2. La APK

Vive en `apps/movil`. Es un envoltorio: enseña el sistema del liceo con su
icono, su nombre y a pantalla completa.

### Lo que hace falta en la máquina que compila

| | Qué |
|---|---|
| Java | **JDK 21**, ni más ni menos (`winget install Microsoft.OpenJDK.21`) |
| Android | Android Studio, o las «command line tools» del SDK |
| Variables | `JAVA_HOME` al JDK 21 y `ANDROID_HOME` al SDK |

**Tiene que ser el 21.** Gradle 8.11 —el que trae este proyecto— no sabe correr
con Java 25, y el que viene dentro de Android Studio es justo ese. Si el
ordenador tiene los dos instalados, `JAVA_HOME` decide cuál se usa:

```powershell
$env:JAVA_HOME="$env:ProgramFiles\Microsoft\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
```

Ya compilada aquí una vez: 4 MB, `com.gestiedu.institutotesting`, con el nombre
y el icono del liceo dentro.

### Preparar la app de un liceo

```bash
cd apps/movil
node scripts/preparar-liceo.mjs --liceo=sanmiguel --url=https://sanmiguel.gestiedu.com
npm run sincronizar
```

El guion saca del servidor el nombre, el color y el logo de ese liceo, y deja
escritos el nombre que va debajo del icono, el paquete
(`com.gestiedu.sanmiguel`), los iconos de todas las densidades y la dirección
que abrirá la app.

Opciones: `--nombre=`, `--color=#2563EB`, `--paquete=`, `--api=` cuando se
quiera forzar algo a mano.

### Probarla en un teléfono

```bash
cd apps/movil
npm run apk:pruebas
```

Sale en `android/app/build/outputs/apk/debug/app-debug.apk`. Se pasa al teléfono
y se instala permitiendo «orígenes desconocidos». **Esta no sirve para Play
Store**: no está firmada.

**Probarla contra tu propio ordenador**, antes de que exista el servidor del
liceo. Los servidores se levantan con un comando aparte, desde la raíz:

```bash
npm run telefono
```

No es `npm run dev` con otro nombre: cambia dos cosas sin las cuales la app se
queda **en blanco**, y ninguna de las dos avisa.

- **`localhost` en un teléfono es el teléfono.** La web le dice al navegador a
  qué dirección pedir los datos, y en desarrollo eso es `localhost:3001`.
  Abierta en el móvil, el teléfono se los pide a sí mismo.
- **Los dos servidores solo le abren la puerta a `localhost`** (CORS en el de
  datos, `allowedDevOrigins` en el de pantallas). Desde el teléfono todo es
  «otro origen».

El comando dice la dirección de este ordenador en la red; con ella se prepara
la APK:

```bash
cd apps/movil
node scripts/preparar-liceo.mjs --liceo=sanmiguel --pruebas --url="http://192.168.1.156:3000/login?slug=sanmiguel"
```

`--pruebas` es lo único que permite `http`, y solo hacia una dirección de red
local. Esa APK **no se reparte**: por ahí van la contraseña y la sesión sin
cifrar, y en el wifi de un liceo eso lo lee cualquiera.

### La versión firmada

La llave de firma es **la identidad del liceo en Google Play**: quien la tenga
puede publicar actualizaciones en su nombre. Se crea una vez y se guarda como se
guarda una llave, no en el repositorio (ya está en `.gitignore`).

```bash
keytool -genkey -v -keystore gestiedu.keystore -alias gestiedu \
        -keyalg RSA -keysize 2048 -validity 10000
```

Luego, en `apps/movil/android/key.properties` (que tampoco se versiona):

```properties
storeFile=../../gestiedu.keystore
storePassword=...
keyAlias=gestiedu
keyPassword=...
```

y `npm run apk:firmada`.

> Si se pierde esa llave, Google Play **no deja publicar más actualizaciones**
> de esa app: hay que subir una nueva y que todos la instalen otra vez. Se
> guarda con el mismo cuidado que las contraseñas de la base de datos.

### Lo que la app añade y la web no puede

- **Bajar archivos.** Dentro de una app, pulsar «Comprobante en imagen» no hace
  nada: la ventana de una app no sabe bajar archivos. `MainActivity.java` se lo
  pasa al gestor de descargas de Android, con la credencial de la sesión, y el
  archivo cae en «Descargas».
- **El botón de atrás** del teléfono navega hacia atrás en vez de cerrar la app
  (lo hace Capacitor).
- **La barra de estado** va del color de la cabecera de la app (blanco), con el
  reloj en oscuro, como Facebook o WhatsApp. Sin eso se ve una banda negra
  pegada a una cabecera blanca, que es lo que delata a una app envuelta. Y no
  vale arreglarlo con CSS: en Android `env(safe-area-inset-top)` mide la
  MUESCA, no la barra de estado, así que en un teléfono sin muesca vale cero
  aunque el reloj tape media cabecera. El hueco lo reserva
  `dejarSitioParaElReloj` en `MainActivity.java`.
- **Entrar con la huella** y **girar la pantalla** en el horario y el plan de
  evaluación (`@capacitor/screen-orientation` desde la web).

### Lo que queda por hacer

- Avisos al teléfono (notificaciones): hace falta una cuenta de Firebase por
  liceo o una compartida, y decidir cuál.
- La cámara para el QR de asistencia, cuando esa función exista.
- Publicación en Google Play: cuenta de desarrollador (25 $ una vez), ficha,
  capturas y política de privacidad.
- Firmarla y publicarla: falta la llave y la cuenta de desarrollador.
