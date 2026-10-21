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
}
