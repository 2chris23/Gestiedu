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

    describe('anti-rebote (histéresis)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('un fallo pone «no contesta» en el acto', () => {
            elServidorContesto();
            elServidorNoContesta();
            expect(elEstadoDelServidor().contesta).toBe(false);
        });

        it('una sola respuesta buena tras un fallo NO lo pone en «contesta»', () => {
            elServidorNoContesta();
            expect(elEstadoDelServidor().contesta).toBe(false);

            elServidorContesto();
            // Solo una respuesta: debe seguir en false
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Incluso si pasan 10 segundos, si solo hubo una respuesta, sigue en false
            jest.advanceTimersByTime(11_000);
            expect(elEstadoDelServidor().contesta).toBe(false);
        });

        it('dos respuestas buenas seguidas requieren 10 s sin fallos para volver a «contesta»', () => {
            elServidorNoContesta();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Primera respuesta buena a los 2 s
            jest.advanceTimersByTime(2_000);
            elServidorContesto();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Segunda respuesta buena a los 5 s (faltan 5 s para los 10 s sin fallos)
            jest.advanceTimersByTime(3_000);
            elServidorContesto();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Pasan 3 s más (total 8 s desde el fallo): aún no debe marcar true
            jest.advanceTimersByTime(3_000);
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Pasan los 2 s restantes (total 10 s limpios): ahora sí pasa a true
            jest.advanceTimersByTime(2_000);
            expect(elEstadoDelServidor().contesta).toBe(true);
            expect(elEstadoDelServidor().ultimaRespuesta).toBeGreaterThan(0);
        });

        it('un fallo en medio de la ventana reinicia la cuenta y cancela el regreso', () => {
            elServidorNoContesta();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Dos respuestas buenas a los 4 s
            jest.advanceTimersByTime(2_000);
            elServidorContesto();
            jest.advanceTimersByTime(2_000);
            elServidorContesto();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Nuevo fallo a los 7 s (antes de cumplir los 10 s)
            jest.advanceTimersByTime(3_000);
            elServidorNoContesta();
            expect(elEstadoDelServidor().contesta).toBe(false);

            // Pasan 5 s más (habrían sido 12 s del primer fallo): pero hubo un fallo, así que debe seguir en false
            jest.advanceTimersByTime(5_000);
            expect(elEstadoDelServidor().contesta).toBe(false);
        });
    });
});
