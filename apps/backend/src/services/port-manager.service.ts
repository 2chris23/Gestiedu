import net from 'net';

/**
 * Servicio de gestión de puertos - DEPRECATED
 *
 * Este servicio pertenecía a la arquitectura anterior de múltiples puertos.
 * Con la migración a subdominios, ya no se asignan puertos individuales a cada instituto.
 * Se mantiene temporalmente por compatibilidad con código legado.
 *
 * @deprecated Use subdomain-based routing instead.
 */
export class PortManagerService {
    private static readonly DEFAULT_START_PORT = 3100;
    private static readonly DEFAULT_END_PORT = 3200;

    /**
     * Verifica si un puerto está disponible en el sistema
     * @deprecated No se usa en la arquitectura de subdominios
     */
    static async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => { server.close(); resolve(true); });
            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Valida que un puerto esté en el rango permitido
     * @deprecated No se usa en la arquitectura de subdominios
     */
    static isPortInRange(port: number): boolean {
        return port >= this.DEFAULT_START_PORT && port <= this.DEFAULT_END_PORT;
    }
}
