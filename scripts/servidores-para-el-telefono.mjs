#!/usr/bin/env node
/**
 * LOS DOS SERVIDORES, PERO PARA QUE LOS VEA UN TELÉFONO
 *
 *   npm run telefono
 *
 * Levanta lo mismo que `npm run dev` en cada aplicación, con dos cambios que
 * parecen tonterías y son la diferencia entre que la app funcione o se quede en
 * blanco:
 *
 *  1. **`localhost` en un teléfono es el teléfono.** La web le dice al
 *     navegador a qué dirección pedir los datos (`NEXT_PUBLIC_API_URL`), y en
 *     desarrollo eso es `http://localhost:3001`. Abierta en el móvil, el
 *     teléfono se pide los datos A SÍ MISMO, no encuentra nada y la pantalla
 *     sale vacía. Aquí se pone la dirección del ordenador en la red.
 *
 *  2. **El servidor no le abre la puerta a cualquiera.** El de datos solo
 *     responde a `localhost` (CORS), y el de pantallas solo atiende al nombre
 *     con el que arrancó (`allowedDevOrigins`). Desde el teléfono, las dos
 *     cosas son «otro origen» y las dos cortan.
 *
 * Esto es SOLO para probar en desarrollo. Va por http y no sirve para el liceo:
 * ahí hay un servidor de verdad con https.
 *
 *   npm run telefono -- --compilado
 *
 * Igual, pero con las pantallas COMPILADAS, como en el liceo. Hace falta para
 * probar la app sin conexión (apagar el PC y ver que el teléfono sigue
 * enseñando lo último): el servidor de desarrollo de Next no arranca la app en
 * el teléfono si no puede hablar con él —medido: la página sale pintada pero
 * muerta, sin un solo botón que responda—. Compilada, arranca sola desde lo
 * guardado. Tarda un par de minutos más en levantarse, y un cambio en el código
 * no se ve hasta volver a lanzarlo.
 *
 *   npm run telefono:usb        (compilado y por el cable)
 *
 * **Por la red de casa, la app NO puede abrir sin conexión, y no es un fallo
 * de la app.** Lo que la hace abrir sin servidor es el ayudante (`sw.js`), y
 * Android solo lo deja funcionar en una dirección segura: https, o
 * `localhost`. `http://192.168.1.156` no es ninguna de las dos, así que ahí
 * el ayudante no existe y al quitar el wifi solo queda la pantalla de error.
 * Medido: en `http://192.168.1.156:3000`, `isSecureContext` es falso y
 * `navigator.serviceWorker` no existe; en la APK por `localhost`, los dos sí.
 *
 * En el liceo no pasa: va por https. Para probarlo aquí, el teléfono va por
 * el cable (o por la depuración inalámbrica) y `adb reverse` hace que su
 * `localhost:3000` sea el de este ordenador. Para ver la app sin servidor, se
 * desenchufa el cable, o se quita el wifi si va por la inalámbrica.
 */

import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const POR_EL_CABLE = process.argv.includes('--usb');

/** La dirección de este ordenador en la red de casa. */
function laDireccionDeEsteOrdenador() {
    // Por el cable, el teléfono llega a este ordenador por su propio
    // `localhost` (ver `adb reverse` más abajo).
    if (POR_EL_CABLE) return 'localhost';

    const preferida = process.argv.find((a) => a.startsWith('--ip='))?.slice(5);
    if (preferida) return preferida;

    const candidatas = [];
    for (const [nombre, direcciones] of Object.entries(networkInterfaces())) {
        for (const d of direcciones ?? []) {
            if (d.family !== 'IPv4' || d.internal) continue;
            candidatas.push({ nombre, ip: d.address });
        }
    }

    // El wifi de casa primero: es la red en la que estará el teléfono.
    const deCasa = candidatas.find((c) => c.ip.startsWith('192.168.')) ?? candidatas[0];
    return deCasa?.ip ?? null;
}

const ip = laDireccionDeEsteOrdenador();
if (!ip) {
    console.error('Este ordenador no está en ninguna red. Conéctalo al wifi, o pasa --ip=192.168.1.10');
    process.exit(1);
}

const web = `http://${ip}:3000`;
const api = `http://${ip}:3001`;

const hijos = [];

const COMPILADO = process.argv.includes('--compilado');

function levantar(nombre, carpeta, variables, orden = ['run', 'dev'], programa = 'npm') {
    const proceso = spawn(programa, orden, {
        cwd: join(RAIZ, 'apps', carpeta),
        env: { ...process.env, ...variables },
        stdio: 'inherit',
        shell: programa === 'npm',
    });
    proceso.on('exit', (codigo) => {
        console.log(`\n[${nombre}] se ha parado (${codigo}).`);
        parar();
    });
    hijos.push(proceso);
    return proceso;
}

function parar() {
    for (const h of hijos) {
        if (!h.killed) h.kill();
    }
    process.exit(0);
}

process.on('SIGINT', parar);
process.on('SIGTERM', parar);

/** `adb`, del SDK de Android: el que hay en el PATH o el que instala Android Studio. */
function dondeEstaAdb() {
    const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
    const sdks = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
        process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk'),
        process.env.HOME && join(process.env.HOME, 'Android', 'Sdk'),
    ].filter(Boolean);
    for (const sdk of sdks) {
        const ruta = join(sdk, 'platform-tools', exe);
        if (existsSync(ruta)) return ruta;
    }
    return 'adb';
}

const adb = (argumentos) =>
    new Promise((resolver) => execFile(ADB, argumentos, { timeout: 10000 }, (error, salida) => resolver(error ? null : salida)));

const ADB = dondeEstaAdb();
const conPuente = new Set();

/**
 * Solo ESE aparato (`--dispositivo=emulator-5554`, o `ANDROID_SERIAL`, como
 * `adb`). Sin nombrarlo, todos los enchufados: el teléfono de quien prueba
 * no se toca si solo se quiere el emulador.
 */
const SOLO_ESTE = process.argv.find((a) => a.startsWith('--dispositivo='))?.slice(14) || process.env.ANDROID_SERIAL || null;

/** `--puente-a-mano`: no se tiende ningún puente (ver abajo). */
const PUENTE_A_MANO = process.argv.includes('--puente-a-mano');

/**
 * El puente: `localhost:3000` y `:3001` del teléfono llevan a este ordenador.
 * Se mira cada pocos segundos porque el teléfono se desenchufa y se vuelve a
 * enchufar —así se prueba la app sin servidor— y al volver el puente ya no
 * está.
 */
async function tenderPuentes() {
    const lista = await adb(['devices']);
    if (lista === null) return false;
    const conectados = lista
        .split(/\r?\n/)
        .slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter(([serie, estado]) => serie && estado === 'device' && (!SOLO_ESTE || serie === SOLO_ESTE))
        .map(([serie]) => serie);

    for (const serie of [...conPuente]) {
        if (!conectados.includes(serie)) {
            conPuente.delete(serie);
            console.log(`\n[cable] ${serie} se ha desconectado: la app ya no llega al servidor.`);
        }
    }
    for (const serie of conectados) {
        // Se mira en el teléfono, no en la lista de aquí: el puente se cae sin
        // que el teléfono se desconecte (medido: el mismo teléfono visto dos
        // veces por la depuración inalámbrica, y al quitar una se llevó el
        // puente de la otra).
        const tendidos = (await adb(['-s', serie, 'reverse', '--list'])) ?? '';
        if (tendidos.includes('tcp:3000 tcp:3000') && tendidos.includes('tcp:3001 tcp:3001')) {
            conPuente.add(serie);
            continue;
        }
        const a = await adb(['-s', serie, 'reverse', 'tcp:3000', 'tcp:3000']);
        const b = await adb(['-s', serie, 'reverse', 'tcp:3001', 'tcp:3001']);
        if (a !== null && b !== null) {
            conPuente.add(serie);
            console.log(`\n[cable] ${serie} conectado: su localhost:3000 es este ordenador.`);
        }
    }
    return true;
}

if (POR_EL_CABLE) {
    console.log(
        '\n════════════════════════════════════════════════════════\n' +
        ' Por el CABLE (o la depuración inalámbrica de Android)\n' +
        ` Pantallas en el teléfono:  ${web}\n` +
        ` Datos:                     ${api}/api\n` +
        '\n' +
        ' La APK de pruebas apunta a localhost:\n' +
        `   cd apps/movil && node scripts/preparar-liceo.mjs --liceo=<liceo> --pruebas --url="${web}/login?slug=<liceo>"\n` +
        '\n' +
        ' Sin servidor: desenchufa el cable (o quita el wifi si va\n' +
        ' por la inalámbrica) y vuelve a abrir la app.\n' +
        '════════════════════════════════════════════════════════\n'
    );
    if (PUENTE_A_MANO) {
        // Para el emulador, que no se desenchufa: el puente lo pone y lo
        // quita quien prueba, y aquí nadie lo vuelve a tender a los 3 s.
        console.log(
            ' Puente a mano:  adb -s <serie> reverse tcp:3000 tcp:3000\n' +
            '                 adb -s <serie> reverse tcp:3001 tcp:3001\n' +
            ' Sin servidor:   adb -s <serie> reverse --remove-all\n'
        );
    } else {
        tenderPuentes().then((hay) => {
            if (!hay) {
                console.error(`No encuentro adb (${ADB}). Hace falta el SDK de Android (Android Studio).`);
                parar();
            }
        });
        setInterval(() => tenderPuentes().catch(() => {}), 3000).unref();
    }
} else {
    console.log(
        '\n════════════════════════════════════════════════════════\n' +
        ` Este ordenador en la red:  ${ip}\n` +
        ` Pantallas:                 ${web}\n` +
        ` Datos:                     ${api}/api\n` +
        '\n' +
        ' Para la APK de pruebas:\n' +
        `   cd apps/movil && node scripts/preparar-liceo.mjs --liceo=<liceo> --pruebas --url="${web}/login?slug=<liceo>"\n` +
        '\n' +
        ' El teléfono tiene que estar en el MISMO wifi.\n' +
        '\n' +
        ' OJO: por aquí (http) la app NO abre sin conexión: Android\n' +
        ' solo deja guardarla en https o localhost. Para probar eso:\n' +
        '   npm run telefono:usb\n' +
        '════════════════════════════════════════════════════════\n'
    );
}

levantar('datos', 'backend', { CORS_ORIGIN: `${web},${api}` });

if (!COMPILADO) {
    levantar('pantallas', 'web', { NEXT_PUBLIC_API_URL: `${api}/api` });
} else {
    // La dirección de los datos se queda dentro al compilar: por eso se
    // compila aquí, con la de este ordenador, y no se reutiliza otra compilación.
    console.log('Compilando las pantallas (un par de minutos)…');
    const variables = { ...process.env, NEXT_PUBLIC_API_URL: `${api}/api` };
    const compilar = spawn('npm', ['run', 'build'], {
        cwd: join(RAIZ, 'apps', 'web'),
        env: variables,
        stdio: 'inherit',
        shell: true,
    });
    hijos.push(compilar);
    compilar.on('exit', (codigo) => {
        if (codigo !== 0) {
            console.error('No se pudo compilar la web. Mira el error de arriba.');
            parar();
            return;
        }
        // Next directamente, sin `npm run start` por delante. Lanzado desde
        // aquí, ese npm se quedaba colgado sin arrancar nada —el puerto 3000
        // no se abría nunca, medido dos veces— y `telefono:compilado` no llegó
        // a servir una sola pantalla.
        const next = join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next');
        levantar(
            'pantallas',
            'web',
            { NEXT_PUBLIC_API_URL: `${api}/api` },
            [next, 'start', '-H', '0.0.0.0', '-p', '3000'],
            process.execPath
        );
    });
}
