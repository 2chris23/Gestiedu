#!/usr/bin/env node
/**
 * EL SISTEMA EN INTERNET, DESDE ESTE PC (solo para pruebas)
 *
 *   npm run tunel                 levanta todo y abre el túnel
 *   npm run tunel -- --apagar     cierra el túnel (si quedó abierto)
 *
 * Con Tailscale Funnel, `https://<pc>.<tailnet>.ts.net` llega a este PC desde
 * cualquier teléfono, con o sin el mismo wifi, mientras el PC esté prendido.
 * Es https de verdad: el ayudante (`sw.js`) existe y la app abre sin conexión,
 * cosa que por `http://192.168.x.x` no pasa nunca (`npm run telefono`).
 *
 * Una sola dirección para todo:
 *   /              → las pantallas (`next start`, compiladas, en 127.0.0.1:3100)
 *   /api, /uploads → Next las reenvía al servidor de datos (127.0.0.1:3001)
 *   /socket.io     → el tiempo real, directo al 3001 (Next no reenvía websockets)
 *
 * Lo que NO sale a internet: la base, Redis, ni los dos puertos sueltos (las
 * pantallas escuchan solo en 127.0.0.1). Al cerrar (Ctrl+C) se cierra el túnel.
 *
 * Cuando el sistema vaya a sus servidores de verdad, esto sobra.
 */

import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function dondeEstaTailscale() {
    const enWindows = 'C:\\Program Files\\Tailscale\\tailscale.exe';
    if (process.platform === 'win32' && existsSync(enWindows)) return enWindows;
    return 'tailscale';
}
const TAILSCALE = dondeEstaTailscale();

const ts = (argumentos) =>
    new Promise((resolver) =>
        execFile(TAILSCALE, argumentos, { timeout: 20000 }, (error, salida, err) =>
            resolver({ ok: !error, salida: String(salida || '') + String(err || '') })
        )
    );

const cerrarElTunel = () => ts(['funnel', 'reset']);

if (process.argv.includes('--apagar')) {
    await cerrarElTunel();
    console.log('Túnel cerrado.');
    process.exit(0);
}

/** El nombre de este PC en Tailscale (`desktop-xxx.tailNNN.ts.net`). */
async function elNombre() {
    const { ok, salida } = await ts(['status', '--json']);
    if (!ok) return null;
    try {
        const estado = JSON.parse(salida.slice(salida.indexOf('{')));
        // `Self.Online` sale falso en Windows aunque el túnel funcione: manda el estado.
        if (estado.BackendState !== 'Running') return { offline: true };
        return { nombre: String(estado.Self.DNSName || '').replace(/\.$/, '') };
    } catch {
        return null;
    }
}

const yo = await elNombre();
if (!yo) {
    console.error('No encuentro Tailscale. Instálalo y entra con tu cuenta (tailscale login).');
    process.exit(1);
}
if (yo.offline || !yo.nombre) {
    console.error('Tailscale está desconectado. Corre `tailscale login` (o `tailscale up`) y vuelve a intentarlo.');
    process.exit(1);
}

const web = `https://${yo.nombre}`;
const interna = 'http://127.0.0.1:3001/api';

/**
 * Las pantallas del túnel van en su propio puerto, no en el 3000: `funnel --bg`
 * sobrevive a este proceso (en Windows, pararlo de golpe no pasa por `parar`),
 * y si apuntara al 3000 publicaría lo próximo que se levantara ahí —la web de
 * desarrollo—. Apuntando al 3100, sin el túnel responde 502 y nada más.
 */
const PUERTO = 3100;

const hijos = [];
let parando = false;

async function parar() {
    if (parando) return;
    parando = true;
    for (const h of hijos) if (!h.killed) h.kill();
    await cerrarElTunel();
    console.log('\nTúnel cerrado.');
    process.exit(0);
}
process.on('SIGINT', parar);
process.on('SIGTERM', parar);

function levantar(nombre, carpeta, variables, orden, programa) {
    const proceso = spawn(programa, orden, {
        cwd: join(RAIZ, 'apps', carpeta),
        env: { ...process.env, ...variables },
        stdio: 'inherit',
        shell: programa === 'npm',
    });
    proceso.on('exit', (codigo) => {
        console.log(`\n[${nombre}] se ha parado (${codigo}).`);
        void parar();
    });
    hijos.push(proceso);
    return proceso;
}

// Lo que va dentro de la compilación y lo que lee el servidor de pantallas.
const DE_LAS_PANTALLAS = {
    NEXT_PUBLIC_API_URL: `${web}/api`,
    API_DEL_SERVIDOR: interna,
};

levantar('datos', 'backend', { ORIGEN_DEL_TUNEL: web }, ['run', 'dev'], 'npm');

console.log('Compilando las pantallas (un par de minutos)…');
const compilar = spawn('npm', ['run', 'build'], {
    cwd: join(RAIZ, 'apps', 'web'),
    env: { ...process.env, ...DE_LAS_PANTALLAS },
    stdio: 'inherit',
    shell: true,
});
hijos.push(compilar);
compilar.on('exit', async (codigo) => {
    if (codigo !== 0) {
        console.error('No se pudo compilar la web. Mira el error de arriba.');
        void parar();
        return;
    }
    const next = join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next');
    levantar('pantallas', 'web', DE_LAS_PANTALLAS, [next, 'start', '-H', '127.0.0.1', '-p', String(PUERTO)], process.execPath);

    await cerrarElTunel();
    const a = await ts(['funnel', '--bg', `http://127.0.0.1:${PUERTO}`]);
    const b = await ts(['funnel', '--bg', '--set-path', '/socket.io', 'http://127.0.0.1:3001/socket.io']);
    if (!a.ok || !b.ok) {
        console.error('No se pudo abrir el túnel:\n' + a.salida + b.salida);
        void parar();
        return;
    }
    console.log(
        '\n════════════════════════════════════════════════════════\n' +
            ` En internet:  ${web}\n` +
            ` El liceo de pruebas:  ${web}/login?slug=instituto-testing\n` +
            '\n' +
            ' La APK de pruebas:\n' +
            `   cd apps/movil && node scripts/preparar-liceo.mjs --liceo=instituto-testing --pruebas --url="${web}/login?slug=instituto-testing"\n` +
            '\n' +
            ' Ctrl+C lo apaga todo y cierra el túnel.\n' +
            '════════════════════════════════════════════════════════\n'
    );
});
