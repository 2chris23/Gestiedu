'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';
import api from '@/lib/axios';
import { BACKEND_URL } from '@/config/env';
import { enLaApk } from '@/lib/avisos-al-telefono';
import { elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { elLiceoDelHost } from '@/lib/el-liceo-de-la-direccion';

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
 * no sirve). La X la esconde una semana; con una versión nueva, vuelve.
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

    if (!ficha) return null;

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
        <aside
            data-descargar-la-app
            className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 lateral:hidden print:hidden"
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white" aria-hidden>
                <Download className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">Descarga la app</p>
                <p className="text-xs text-gray-700">
                    Funciona sin conexión · V{ficha.versionName} · {megas} MB
                </p>
            </div>
            <a
                href={url}
                download
                className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white active:bg-blue-700"
            >
                Descargar
            </a>
            <button
                type="button"
                onClick={esconder}
                aria-label="Ahora no"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 active:bg-blue-100"
            >
                <X className="h-5 w-5" aria-hidden />
            </button>
        </aside>
    );
}

export default DescargarLaApp;
