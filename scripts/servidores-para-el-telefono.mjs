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
 */

import { spawn } from 'child_process';
import { networkInterfaces } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** La dirección de este ordenador en la red de casa. */
function laDireccionDeEsteOrdenador() {
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

function levantar(nombre, carpeta, variables, orden = ['run', 'dev']) {
    const proceso = spawn('npm', orden, {
        cwd: join(RAIZ, 'apps', carpeta),
        env: { ...process.env, ...variables },
        stdio: 'inherit',
        shell: true,
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
    '════════════════════════════════════════════════════════\n'
);

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
        levantar('pantallas', 'web', { NEXT_PUBLIC_API_URL: `${api}/api` }, ['run', 'start', '--', '-H', '0.0.0.0', '-p', '3000']);
    });
}
