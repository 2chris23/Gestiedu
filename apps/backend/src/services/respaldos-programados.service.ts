import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
    carpetaDeRespaldos,
    limpiarRespaldosViejos,
    respaldarTodos,
    InformeDeRespaldo,
} from './respaldos.service';
import { destinoDeFuera, subirAFuera } from './copia-fuera.service';
import { alertService, AlertSeverity } from './alert.service';
import { logger } from '../utils/logger';

/**
 * LOS RESPALDOS, SOLOS, CADA NOCHE
 *
 * Los respaldos funcionaban y estaban probados (se borra medio liceo, se
 * restaura y vuelve exacto), pero había que acordarse de lanzarlos. Un
 * respaldo que depende de que alguien se acuerde no es un respaldo.
 *
 * Esto corre en su propio contenedor (`respaldos` en docker-compose.prod.yml):
 * espera a la hora (`HORA_DE_RESPALDO`, 02:00 por defecto, en la zona del
 * servidor), respalda todos los liceos, borra los viejos, sube una copia fuera
 * si está configurado (`copia-fuera.service.ts`) y deja escrito cómo le fue en
 * `estado.json`, junto a los respaldos. Si algo falla, además, levanta una
 * alerta CRÍTICA que ve el superadmin en su panel.
 *
 * El panel lee ese mismo `estado.json`: si el último respaldo bueno tiene más de
 * 26 horas, sale «atrasado» aunque nadie haya visto un error — que es justo el
 * caso de un contenedor que se paró sin decir nada.
 */

export const ARCHIVO_DE_ESTADO = 'estado.json';
const HORAS_HASTA_ATRASADO = 26;

export interface EstadoDeLosRespaldos {
    ultimaVez: string;
    ultimaVezBien: string | null;
    liceos: number;
    guardados: number;
    fallidos: string[];
    copiaFuera: 'desactivada' | 'ok' | 'fallo';
    erroresDeCopiaFuera: string[];
    segundos: number;
}

export type Salud = 'sin-programar' | 'al-dia' | 'atrasado' | 'fallo';

export function leerEstado(carpeta = carpetaDeRespaldos()): EstadoDeLosRespaldos | null {
    const archivo = path.join(carpeta, ARCHIVO_DE_ESTADO);
    if (!existsSync(archivo)) return null;
    try {
        return JSON.parse(readFileSync(archivo, 'utf8'));
    } catch {
        return null;
    }
}

export function saludDeLosRespaldos(estado: EstadoDeLosRespaldos | null, ahora = new Date()): Salud {
    if (!estado) return 'sin-programar';
    if (estado.fallidos.length > 0 || estado.copiaFuera === 'fallo') return 'fallo';
    if (!estado.ultimaVezBien) return 'fallo';
    const horas = (ahora.getTime() - new Date(estado.ultimaVezBien).getTime()) / 3_600_000;
    return horas > HORAS_HASTA_ATRASADO ? 'atrasado' : 'al-dia';
}

/** Milisegundos hasta la próxima vez que den las `hh:mm` en el reloj del servidor. */
export function msHastaLaHora(hora: string, ahora = new Date()): number {
    const [h, m] = hora.split(':').map(Number);
    const siguiente = new Date(ahora);
    siguiente.setHours(Number.isFinite(h) ? h : 2, Number.isFinite(m) ? m : 0, 0, 0);
    if (siguiente.getTime() <= ahora.getTime()) siguiente.setDate(siguiente.getDate() + 1);
    return siguiente.getTime() - ahora.getTime();
}

/** Una pasada completa: respaldar, limpiar, sacar fuera, apuntar, avisar. */
export async function respaldarAhora(
    carpeta = carpetaDeRespaldos(),
    // Las pruebas pasan uno de mentira: el `pg_dump` de verdad ya lo prueba
    // `respaldos.test.ts`, y aquí lo que se comprueba es todo lo de alrededor.
    respaldar: (carpeta: string) => Promise<InformeDeRespaldo> = respaldarTodos
): Promise<EstadoDeLosRespaldos> {
    const t0 = Date.now();
    const anterior = leerEstado(carpeta);
    const informe: InformeDeRespaldo = await respaldar(carpeta);

    try {
        limpiarRespaldosViejos(carpeta);
    } catch (error) {
        logger.warn('No se pudieron limpiar los respaldos viejos', { error: String(error) });
    }

    const destino = destinoDeFuera();
    const erroresDeCopiaFuera: string[] = [];
    if (destino) {
        for (const r of informe.resultados) {
            if (!r.ok || !r.archivo) continue;
            try {
                await subirAFuera(r.archivo, r.slug, destino);
            } catch (error) {
                erroresDeCopiaFuera.push(`${r.slug}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    const todoBien = informe.fallidos.length === 0 && erroresDeCopiaFuera.length === 0;
    const ahora = new Date().toISOString();
    const estado: EstadoDeLosRespaldos = {
        ultimaVez: ahora,
        ultimaVezBien: todoBien ? ahora : anterior?.ultimaVezBien ?? null,
        liceos: informe.total,
        guardados: informe.guardados,
        fallidos: informe.fallidos.map((f) => `${f.slug}: ${f.error}`),
        copiaFuera: !destino ? 'desactivada' : erroresDeCopiaFuera.length ? 'fallo' : 'ok',
        erroresDeCopiaFuera,
        segundos: Math.round((Date.now() - t0) / 1000),
    };
    writeFileSync(path.join(carpeta, ARCHIVO_DE_ESTADO), JSON.stringify(estado, null, 2));

    if (!todoBien) {
        await alertService.createAlert({
            type: 'BACKUP_FAILED',
            severity: AlertSeverity.CRITICAL,
            message:
                `Respaldo nocturno con fallos: ${informe.fallidos.length} liceo(s) sin respaldar` +
                (erroresDeCopiaFuera.length ? `, ${erroresDeCopiaFuera.length} copia(s) sin subir fuera` : ''),
            data: { fallidos: estado.fallidos, erroresDeCopiaFuera },
        });
    }
    logger.info('Respaldo nocturno terminado', {
        liceos: estado.liceos,
        guardados: estado.guardados,
        fallidos: estado.fallidos.length,
        copiaFuera: estado.copiaFuera,
        segundos: estado.segundos,
    });
    return estado;
}
