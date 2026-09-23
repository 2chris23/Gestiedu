#!/usr/bin/env node
/**
 * UNA APP POR LICEO, SIN TOCAR NADA A MANO
 *
 *   node scripts/preparar-liceo.mjs --liceo=sanmiguel --url=https://sanmiguel.gestiedu.com
 *
 * Deja el proyecto de Android listo para compilar la APK de ESE liceo: su
 * nombre debajo del icono, su icono, su color en la barra de estado y su
 * dirección. Después:
 *
 *   npm run sincronizar   (npx cap sync android)
 *   npm run apk:pruebas   (una APK sin firmar, para probar en un teléfono)
 *
 * Por qué se prepara así y no hay una app "para todos": el alumno instala la
 * app de SU liceo —la busca por el nombre de su liceo y ve su escudo—, no una
 * aplicación genérica en la que primero tendría que buscar su colegio en una
 * lista. Y cada liceo puede tener su propia ficha en Google Play.
 *
 * Lo que NO hace este guion, a propósito: firmar la APK. La llave de firma es
 * la identidad del liceo en Google Play —quien la tiene puede publicar
 * actualizaciones en su nombre— y no se genera ni se guarda desde aquí.
 * `docs/APP-MOVIL.md` explica cómo se crea y dónde se pone.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ANDROID = join(RAIZ, 'android', 'app', 'src', 'main');

/** Los tamaños que pide Android para el icono, uno por densidad de pantalla. */
const DENSIDADES = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
];

/**
 * El icono "adaptable" es más grande que el que se ve: Android lo recorta con
 * la forma del teléfono y lo mueve al animarlo. De 108 solo se ven los 72 del
 * centro, así que el dibujo va al 45 % o se pierde por los bordes.
 */
const LADO_ADAPTABLE = 432;
const PARTE_VISIBLE = 0.45;

function argumento(nombre) {
    const crudo = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return crudo ? crudo.slice(nombre.length + 3) : undefined;
}

const colorValido = (valor, porDefecto) =>
    typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor) ? valor : porDefecto;

/** El nombre del paquete solo admite letras, números y puntos. */
const paqueteDe = (liceo) => `com.gestiedu.${liceo.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

async function elLiceo(api, slug) {
    try {
        const r = await fetch(`${api}/api/institutes/current/config`, {
            headers: { 'X-Institute-Slug': slug },
        });
        if (!r.ok) return null;
        const { data } = await r.json();
        return data ?? null;
    } catch {
        return null;
    }
}

async function bajarLogo(api, slug) {
    try {
        const r = await fetch(`${api}/api/institutes/current/icono?tam=512&liceo=${encodeURIComponent(slug)}`);
        if (!r.ok) return null;
        return Buffer.from(await r.arrayBuffer());
    } catch {
        return null;
    }
}

async function dibujarIconos(fuente, color) {
    const visible = Math.round(LADO_ADAPTABLE * PARTE_VISIBLE);
    const dibujo = await sharp(fuente)
        .resize(visible, visible, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

    // El adaptable: el dibujo suelto sobre transparente, que Android pone
    // encima del fondo de color.
    const margen = Math.round((LADO_ADAPTABLE - visible) / 2);
    const adaptable = await sharp({
        create: { width: LADO_ADAPTABLE, height: LADO_ADAPTABLE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite([{ input: dibujo, top: margen, left: margen }])
        .png()
        .toBuffer();

    for (const [densidad, lado] of DENSIDADES) {
        const carpeta = join(ANDROID, 'res', `mipmap-${densidad}`);
        await mkdir(carpeta, { recursive: true });

        // El cuadrado de siempre, para los Android viejos que no recortan.
        const cuadrado = await sharp(fuente).resize(lado, lado, { fit: 'cover' }).png().toBuffer();
        await writeFile(join(carpeta, 'ic_launcher.png'), cuadrado);
        await writeFile(join(carpeta, 'ic_launcher_round.png'), cuadrado);

        await writeFile(
            join(carpeta, 'ic_launcher_foreground.png'),
            await sharp(adaptable).resize(Math.round(lado * 2.25), Math.round(lado * 2.25)).png().toBuffer()
        );
    }

    await writeFile(
        join(ANDROID, 'res', 'values', 'ic_launcher_background.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`
    );

    // Dos colores, y distintos a propósito: la franja del reloj va del color de
    // la cabecera de la app (blanca) y el del liceo se guarda para la pantalla
    // de arranque. Ver `dejarSitioParaElReloj` en MainActivity.java.
    await writeFile(
        join(ANDROID, 'res', 'values', 'colors.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
            `    <color name="color_de_la_barra_de_estado">#FFFFFF</color>\n` +
            `    <color name="color_del_liceo">${color}</color>\n` +
            `</resources>\n`
    );
}

async function main() {
    const liceo = argumento('liceo');
    const url = argumento('url');
    const api = argumento('api') || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:3001';

    if (!liceo || !url) {
        console.error('Falta algo. Así se usa:\n' +
            '  node scripts/preparar-liceo.mjs --liceo=sanmiguel --url=https://sanmiguel.gestiedu.com\n\n' +
            '  --liceo  el nombre corto del liceo (el mismo de su dirección)\n' +
            '  --url    dónde vive su sistema; la app abre eso\n' +
            '  --api    (opcional) el servidor del que se saca el nombre y el logo');
        process.exit(1);
    }

    /**
     * LA APP DE VERDAD VA POR https, SIN EXCEPCIONES
     *
     * Por ahí viajan la contraseña y la sesión de cada alumno. En el wifi de un
     * liceo, http significa que cualquiera conectado puede leerlas.
     *
     * `--pruebas` abre la mano para UNA cosa: apuntar la app al ordenador de
     * quien la está haciendo (una dirección de red local), para verla en un
     * teléfono de verdad antes de que exista el servidor. Esa APK no se
     * reparte: se queda en la mesa de quien prueba.
     */
    const dePruebas = process.argv.includes('--pruebas');
    const esDeCasa = /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url);

    if (!/^https:\/\//i.test(url) && !(dePruebas && esDeCasa)) {
        console.error(
            'La dirección tiene que ser https: por ahí van la contraseña y la sesión.\n' +
            'Para probar contra tu propio ordenador: añade --pruebas y una dirección de red local.'
        );
        process.exit(1);
    }

    const ficha = await elLiceo(api, liceo);
    const nombre = argumento('nombre') || ficha?.name || 'GestiEdu';
    const color = colorValido(argumento('color') || ficha?.primaryColor, '#2563EB');
    const paquete = argumento('paquete') || paqueteDe(liceo);

    // 1. La configuración de Capacitor: a qué dirección apunta la app.
    const config = JSON.parse(await readFile(join(RAIZ, 'capacitor.config.json'), 'utf-8'));
    config.appId = paquete;
    config.appName = nombre;
    // `cleartext` solo se enciende en una APK de pruebas contra la red local:
    // es lo que permite http, y por eso no se enciende en ninguna otra.
    const enClaro = dePruebas && esDeCasa;
    config.server = {
        url,
        cleartext: enClaro,
        androidScheme: enClaro ? 'http' : 'https',
        // Sin esto, cuando el servidor del liceo no contesta, Android enseña su
        // propia pantalla de error («ERR_CONNECTION_REFUSED», en inglés y con
        // letra pequeña) y `www/index.html` no se ve NUNCA. Con `volver`, esa
        // pantalla sabe a dónde reintentar.
        errorPath: `index.html?volver=${encodeURIComponent(url)}`,
    };
    config.plugins.SplashScreen.backgroundColor = color;
    // La barra de estado NO se pinta del color del liceo: va del color de la
    // cabecera de la app, que es blanca, como hacen Facebook o WhatsApp. Una
    // raya de otro color encima de una cabecera blanca se ve como un borde
    // pegado, no como parte de la aplicación. El color del liceo identifica
    // donde toca: el icono y la pantalla de arranque.
    await writeFile(join(RAIZ, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');

    // 2. El nombre que sale debajo del icono y el paquete.
    await writeFile(
        join(ANDROID, 'res', 'values', 'strings.xml'),
        `<?xml version='1.0' encoding='utf-8'?>\n<resources>\n` +
        `    <string name="app_name">${nombre}</string>\n` +
        `    <string name="title_activity_main">${nombre}</string>\n` +
        `    <string name="package_name">${paquete}</string>\n` +
        `    <string name="custom_url_scheme">${paquete}</string>\n</resources>\n`
    );

    const gradle = join(RAIZ, 'android', 'app', 'build.gradle');
    if (existsSync(gradle)) {
        const texto = await readFile(gradle, 'utf-8');
        /**
         * Solo el `applicationId`, NO el `namespace`.
         *
         * Son dos cosas distintas y se confunden: el `applicationId` es el
         * nombre con el que el teléfono y Google Play distinguen la app —ese sí
         * cambia por liceo, para que puedan convivir— y el `namespace` es el
         * paquete del CÓDIGO, que es siempre el mismo. Al cambiar los dos, la
         * clase `R` (la de los textos y los iconos) se generaba en un paquete y
         * `MainActivity` vivía en otro: «package R does not exist» y no
         * compilaba nada.
         */
        await writeFile(
            gradle,
            texto.replace(/applicationId\s+"[^"]+"/, `applicationId "${paquete}"`)
        );
    }

    // 3. El icono. Si el liceo no tiene logo, se queda el de la plataforma.
    const logo = await bajarLogo(api, liceo);
    const fuente = logo ?? join(RAIZ, '..', 'web', 'public', 'icons', 'icono-512.png');
    await dibujarIconos(fuente, color);

    console.log(
        `Listo: ${nombre}\n` +
        `  paquete   ${paquete}\n` +
        `  dirección ${url}\n` +
        `  color     ${color}\n` +
        `  icono     ${logo ? 'el del liceo' : 'el de la plataforma (ese liceo no tiene logo)'}\n` +
        (enClaro ? '  AVISO     APK DE PRUEBAS: va por http. No se reparte.\n' : '') +
        '\n' +
        'Ahora:  npm run sincronizar  y luego  npm run apk:pruebas'
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
