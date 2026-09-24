import { esQueNoContesta, elServidorContesto, elServidorNoContesta, elEstadoDelServidor } from './estado-del-servidor';

/**
 * «El servidor dijo que no» y «el servidor no contestó» son cosas distintas, y
 * la app hace cosas distintas con cada una: con la primera enseña el motivo;
 * con la segunda sigue enseñando lo guardado, avisa de que falta conexión y NO
 * cierra la sesión.
 */
describe('¿Contestó el servidor?', () => {
    const conRespuesta = (status: number, tipo = 'application/json; charset=utf-8') => ({
        isAxiosError: true,
        response: { status, headers: { 'content-type': tipo }, data: {} },
    });

    it('no llegó nada: no contestó', () => {
        expect(esQueNoContesta({ isAxiosError: true, code: 'ERR_NETWORK' })).toBe(true);
        expect(esQueNoContesta({ isAxiosError: true, code: 'ECONNABORTED' })).toBe(true);
        expect(esQueNoContesta({ isAxiosError: true })).toBe(true);
        expect(esQueNoContesta(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('el repartidor dice que detrás no hay nadie: no contestó', () => {
        expect(esQueNoContesta(conRespuesta(502, 'text/html'))).toBe(true);
        expect(esQueNoContesta(conRespuesta(503))).toBe(true);
        expect(esQueNoContesta(conRespuesta(504, 'text/html'))).toBe(true);
        // Un 500 que no es del servidor (no viene en JSON): el proxy que no llega.
        expect(esQueNoContesta(conRespuesta(500, 'text/plain'))).toBe(true);
    });

    it('el servidor contestó, aunque fuera para decir que no', () => {
        for (const s of [400, 401, 403, 404, 409, 422]) expect(esQueNoContesta(conRespuesta(s))).toBe(false);
        expect(esQueNoContesta(conRespuesta(500))).toBe(false); // un 500 suyo, con su motivo
        expect(esQueNoContesta(null)).toBe(false);
    });

    it('un error envuelto por un servicio: es la conexión solo si el servidor consta como caído', () => {
        const envuelto = new Error('Error al obtener años escolares');
        elServidorContesto();
        expect(esQueNoContesta(envuelto)).toBe(false);
        elServidorNoContesta();
        expect(esQueNoContesta(envuelto)).toBe(true);
        // Una respuesta del servidor sigue siendo una respuesta, caído o no.
        expect(esQueNoContesta(conRespuesta(403))).toBe(false);
        elServidorContesto();
    });

    it('lleva la cuenta: no contesta, y vuelve', () => {
        elServidorNoContesta();
        expect(elEstadoDelServidor().contesta).toBe(false);
        elServidorContesto();
        expect(elEstadoDelServidor().contesta).toBe(true);
        expect(elEstadoDelServidor().ultimaRespuesta).toBeGreaterThan(0);
    });
});
