import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * LO QUE SE MIDE SE GUARDA
 *
 * Solo `medir:estres` dejaba su resultado escrito; los demás medidores lo
 * decían por pantalla y se perdía al cerrar la consola. Así no hay con qué
 * comparar la semana siguiente, ni forma de enseñar lo que se midió.
 *
 * Cada medición queda en `docs/mediciones/<nombre>-<fecha>.json`, con la
 * máquina en la que se midió: el mismo número en un portátil y en un servidor
 * no significa lo mismo.
 */
export function guardarMedicion(nombre: string, datos: Record<string, unknown>): string {
    const carpeta = path.join(__dirname, '..', '..', '..', '..', 'docs', 'mediciones');
    fs.mkdirSync(carpeta, { recursive: true });
    const cuando = new Date();
    const archivo = path.join(carpeta, `${nombre}-${cuando.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
    fs.writeFileSync(
        archivo,
        JSON.stringify(
            {
                cuando: cuando.toISOString(),
                maquina: {
                    procesador: os.cpus()[0]?.model,
                    nucleos: os.cpus().length,
                    memoriaGB: Math.round(os.totalmem() / 1024 ** 3),
                    sistema: `${os.platform()} ${os.release()}`,
                    node: process.version,
                },
                ...datos,
            },
            null,
            2
        )
    );
    const relativo = path.relative(process.cwd(), archivo);
    console.log(`  Guardado en ${relativo}\n`);
    return relativo;
}
