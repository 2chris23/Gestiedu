/**
 * RESPALDOS CADA NOCHE, SIN QUE NADIE SE ACUERDE
 *
 *   node dist/scripts/respaldos-cada-noche.js        ← lo que corre el contenedor `respaldos`
 *   npm run backup:cada-noche -- --ahora            ← una pasada ya, para probar
 *
 * Espera a `HORA_DE_RESPALDO` (02:00 por defecto) y hace una pasada completa
 * cada día: ver `services/respaldos-programados.service.ts`. Nunca se cae por
 * un respaldo fallido: lo apunta, avisa y vuelve a esperar a la noche
 * siguiente. Si se cayera, dejaría de respaldar sin que nadie se enterase.
 */
import { respaldarAhora, msHastaLaHora } from '../services/respaldos-programados.service';
import { disconnectAll } from '../config/database';
import { logger } from '../utils/logger';

const HORA = process.env.HORA_DE_RESPALDO || '02:00';

async function unaPasada() {
    try {
        const estado = await respaldarAhora();
        console.log(
            `[respaldos] ${estado.guardados}/${estado.liceos} liceos, copia fuera: ${estado.copiaFuera}, ${estado.segundos}s` +
                (estado.fallidos.length ? `  FALLARON: ${estado.fallidos.join(' | ')}` : '')
        );
        return estado.fallidos.length === 0 && estado.copiaFuera !== 'fallo';
    } catch (error) {
        logger.error('El respaldo nocturno falló entero', { error: error instanceof Error ? error.message : String(error) });
        return false;
    }
}

async function main() {
    if (process.argv.includes('--ahora')) {
        const bien = await unaPasada();
        await disconnectAll().catch(() => undefined);
        process.exit(bien ? 0 : 1);
    }

    console.log(`[respaldos] programados cada día a las ${HORA} (hora del servidor)`);
    for (;;) {
        const espera = msHastaLaHora(HORA);
        console.log(`[respaldos] el próximo, dentro de ${Math.round(espera / 60000)} min`);
        await new Promise((r) => setTimeout(r, espera));
        await unaPasada();
    }
}

main();
