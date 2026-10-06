'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import api from '@/lib/axios';
import { BACKEND_URL } from '@/config/env';
import { enLaApk } from '@/lib/avisos-al-telefono';
import { elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { elLiceoDelHost } from '@/lib/el-liceo-de-la-direccion';
import { useTurnoDeOfrecer } from '@/lib/turno-de-ofrecer';
import { TarjetaQueOfrece, botonPrincipal, botonSecundario } from '@/components/common/TarjetaQueOfrece';

/**
 * «DESCARGA LA APP» (mientras no esté en Google Play)
 *
 * Decidido por Cristian (2026-10-06): la APK no va a la tienda por ahora. Se
 * reparte así: quien entra al sistema desde el NAVEGADOR de un Android ve
 * aquí la app de su liceo, siempre la última publicada (el servidor la
 * busca por el liceo: `GET /app-movil/del-liceo/:slug`), con su versión y su
 * tamaño. Ya instalada, la app se pone al día sola (`ActualizarLaApp`).
 *
 * No sale dentro de la APK, ni en un iPhone ni en un ordenador (allí una APK
 * no sirve). «Ahora no» la esconde una semana; con una versión nueva, vuelve.
 * Flota abajo y sale sola, sin las otras ofertas a la vez (`lib/turno-de-ofrecer.ts`).
 */

interface Ficha {
    versionCode: number;
    versionName: string;
    tamano: number;
    url: string;
}

const ESCONDIDA = 'gestiedu:descargar-la-app-escondida';
const UNA_SEMANA = 7 * 24 * 60 * 60 * 1000;

function esUnAndroid(): boolean {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

function elLiceo(): string | null {
    if (typeof window === 'undefined') return null;
    return elLiceoDeLaCookie() ?? elLiceoDelHost(window.location.host) ?? new URLSearchParams(window.location.search).get('slug');
}

function escondida(versionCode: number): boolean {
    try {
        const e = JSON.parse(localStorage.getItem(ESCONDIDA) || 'null') as { versionCode: number; hasta: number } | null;
        return Boolean(e && e.versionCode === versionCode && Date.now() < e.hasta);
    } catch {
        return false;
    }
}

export function DescargarLaApp() {
    const [ficha, setFicha] = React.useState<Ficha | null>(null);

    React.useEffect(() => {
        if (enLaApk() || !esUnAndroid()) return;
        const liceo = elLiceo();
        if (!liceo) return;
        let vivo = true;
        api.get<Ficha>(`/app-movil/del-liceo/${encodeURIComponent(liceo)}`, { timeout: 8000 })
            .then(({ data }) => {
                if (vivo && data?.url && !escondida(data.versionCode)) setFicha(data);
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
        };
    }, []);

    const meToca = useTurnoDeOfrecer('descargar-la-app', Boolean(ficha));
    if (!ficha || !meToca) return null;

    const url = ficha.url.startsWith('http') ? ficha.url : `${BACKEND_URL}${ficha.url}`;
    const megas = (ficha.tamano / 1024 / 1024).toFixed(1).replace('.', ',');
    const esconder = () => {
        try {
            localStorage.setItem(ESCONDIDA, JSON.stringify({ versionCode: ficha.versionCode, hasta: Date.now() + UNA_SEMANA }));
        } catch {
            /* sin almacenamiento: volverá a salir, no pasa nada */
        }
        setFicha(null);
    };

    return (
        <TarjetaQueOfrece
            etiqueta="Descarga la app"
            data-descargar-la-app="1"
            titulo="Descarga la app"
            texto={`Funciona sin conexión y te avisa de lo nuevo. Versión ${ficha.versionName} · ${megas} MB.`}
            icono={<Download className="h-5 w-5" />}
        >
            <button type="button" onClick={esconder} className={botonSecundario}>
                Ahora no
            </button>
            <a href={url} download className={botonPrincipal}>
                Descargar
            </a>
        </TarjetaQueOfrece>
    );
}

export default DescargarLaApp;
