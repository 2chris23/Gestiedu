import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';

/**
 * QUÉ RUTAS PIDIERON LAS PRUEBAS DE VERDAD (solo con RUTAS_PROBADAS)
 *
 * Cada servidor que arranca una prueba apunta «MÉTODO ruta-molde código» de
 * cada respuesta y, al cerrarse (o al salir el proceso), lo deja en un archivo
 * suyo dentro de la carpeta. Así se sabe qué opción se probó sin adivinarlo
 * leyendo las direcciones escritas en las pruebas.
 */
export function apuntarRutasProbadas(server: FastifyInstance, carpeta: string): void {
    const vistas = new Map<string, number>();
    server.addHook('onResponse', async (request, reply) => {
        const molde = request.routeOptions?.url;
        if (!molde) return;
        const clave = `${request.method} ${molde} ${reply.statusCode}`;
        vistas.set(clave, (vistas.get(clave) ?? 0) + 1);
    });
    let escrito = false;
    const escribir = () => {
        if (escrito || vistas.size === 0) return;
        escrito = true;
        try {
            fs.mkdirSync(carpeta, { recursive: true });
            const archivo = path.join(carpeta, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
            fs.writeFileSync(archivo, [...vistas].map(([k, n]) => `${k} ${n}`).join('\n'));
        } catch {
            // Medir nunca tumba una prueba.
        }
    };
    process.once('exit', escribir);
    server.addHook('onClose', async () => {
        escribir();
        process.removeListener('exit', escribir);
    });
}
