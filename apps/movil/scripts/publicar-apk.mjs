#!/usr/bin/env node
/**
 * PUBLICAR UNA VERSIÓN NUEVA DE LA APP
 *
 *   npm run publicar                         (APK de pruebas)
 *   npm run publicar -- --firmada            (la del liceo, con su llave)
 *   npm run publicar -- --notas="Arreglada la franja del reloj"
 *
 * Sube el número de versión (`version-de-la-app.json`), compila la APK y la
 * deja, con su ficha, donde el servidor la entrega a las apps ya instaladas
 * (`APP_MOVIL_DIR`; aquí, `apks/` en la raíz). La próxima vez que alguien
 * abra la app, le sale «Hay una versión nueva» y se la baja desde la propia
 * app (ver `apps/backend/src/routes/app-movil.routes.ts`).
 *
 * Solo hace falta publicar cuando cambia lo de DENTRO de la APK (lo de
 * `android/`, los complementos de Capacitor). Lo de la web —pantallas, notas,
 * horarios— se ve al instante sin publicar nada.
 *
 * El proyecto de Android tiene que estar preparado para el liceo antes
 * (`scripts/preparar-liceo.mjs`): de ahí sale el nombre del paquete.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO_DE_VERSION = join(RAIZ, 'version-de-la-app.json');

const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const FIRMADA = process.argv.includes('--firmada');
const destino = resolve(process.env.APP_MOVIL_DIR || join(RAIZ, '..', '..', 'apks'));

/** Si algo falla a medias, el número vuelve a como estaba: una versión que no salió no gasta número. */
let alFallar = () => {};

function correr(orden, argumentos, carpeta) {
    // En Windows `gradlew.bat` y `npx` son guiones: hace falta la consola, y
    // una ruta completa va entre comillas (la carpeta puede llevar espacios).
    // `npx` a secas NO: entre comillas, `npx.cmd` se busca a sí mismo en la
    // carpeta equivocada.
    const enWindows = process.platform === 'win32';
    const comoSeLlama = enWindows && /[\\/]/.test(orden) ? `"${orden}"` : orden;
    const r = spawnSync(comoSeLlama, argumentos, { cwd: carpeta, stdio: 'inherit', shell: enWindows });
    if (r.status !== 0) {
        console.error(`\nFalló: ${orden} ${argumentos.join(' ')}`);
        alFallar();
        process.exit(r.status ?? 1);
    }
}

const config = JSON.parse(readFileSync(join(RAIZ, 'capacitor.config.json'), 'utf-8'));
const paquete = config.appId;
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(paquete ?? '')) {
    console.error('capacitor.config.json no tiene un paquete válido. Prepara antes el liceo: node scripts/preparar-liceo.mjs');
    process.exit(1);
}

// 1. Un número más. Android no instala una versión encima de otra con el
//    mismo número o uno menor.
const version = JSON.parse(readFileSync(ARCHIVO_DE_VERSION, 'utf-8'));
const nueva = { versionCode: version.versionCode + 1, versionName: `1.${version.versionCode + 1}` };
writeFileSync(ARCHIVO_DE_VERSION, JSON.stringify(nueva, null, 2) + '\n');
alFallar = () => {
    writeFileSync(ARCHIVO_DE_VERSION, JSON.stringify(version, null, 2) + '\n');
    console.error(`El número de versión vuelve a ${version.versionCode}.`);
};

// 2. Compilar.
correr('npx', ['cap', 'sync', 'android'], RAIZ);
const gradlew = join(RAIZ, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
correr(gradlew, [FIRMADA ? 'assembleRelease' : 'assembleDebug'], join(RAIZ, 'android'));

const salida = FIRMADA
    ? join(RAIZ, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
    : join(RAIZ, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(salida)) {
    console.error(`No salió la APK (${salida}).`);
    alFallar();
    process.exit(1);
}

// 3. Dejarla, con su ficha, donde el servidor la entrega.
mkdirSync(destino, { recursive: true });
const apk = join(destino, `${paquete}.apk`);
copyFileSync(salida, apk);
const datos = readFileSync(apk);
const ficha = {
    versionCode: nueva.versionCode,
    versionName: nueva.versionName,
    sha256: createHash('sha256').update(datos).digest('hex'),
    tamano: datos.length,
    publicada: new Date().toISOString(),
    ...(argumento('notas') ? { notas: argumento('notas') } : {}),
};
writeFileSync(join(destino, `${paquete}.json`), JSON.stringify(ficha, null, 2) + '\n');

console.log(
    `\nPublicada ${paquete} ${nueva.versionName} (versión ${nueva.versionCode}, ${(datos.length / 1024 / 1024).toFixed(1)} MB)\n` +
        `  en ${destino}\n` +
        (FIRMADA ? '' : '  AVISO: es la de PRUEBAS (firma de depuración). No se reparte.\n') +
        '\nLas apps instaladas la ofrecerán la próxima vez que se abran.'
);
