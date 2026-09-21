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

**Las dos enseñan la web que vive en el servidor del liceo.** Eso es a propósito:
el liceo corrige una nota y se ve en el acto, sin que nadie tenga que actualizar
nada desde una tienda. Por eso la app necesita internet; sin señal enseña una
pantalla propia («No hay conexión») en vez del error del navegador.

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
liceo: se prepara con `--pruebas` y la dirección de red local del ordenador,
con los dos servidores arriba y el teléfono en el mismo wifi.

```bash
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
- **La barra de estado** va del color del liceo.

### Lo que queda por hacer

- Avisos al teléfono (notificaciones): hace falta una cuenta de Firebase por
  liceo o una compartida, y decidir cuál.
- La cámara para el QR de asistencia, cuando esa función exista.
- Publicación en Google Play: cuenta de desarrollador (25 $ una vez), ficha,
  capturas y política de privacidad.
- Firmarla y publicarla: falta la llave y la cuenta de desarrollador.
