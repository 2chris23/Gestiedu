import { taparDatos, taparEnTexto } from '../utils/datos-en-registros';

/**
 * LO QUE NO SE ESCRIBE EN LOS REGISTROS (REGISTRO-01…03)
 * La cédula es el id del usuario: sin esto, el registro era una lista de
 * cédulas de niños. Ver `utils/datos-en-registros.ts`.
 */
describe('Datos personales fuera de los registros (REGISTRO)', () => {
    it('REGISTRO-01: cédulas y teléfonos quedan con sus 3 últimas cifras; los correos, con el dominio', () => {
        expect(taparEnTexto('GET /api/students/12345678/boleta')).toBe('GET /api/students/*****678/boleta');
        expect(taparEnTexto('V-30123456 llamó al 04141234567')).toBe('V-*****456 llamó al ********567');
        expect(taparEnTexto('no llegó a ana.perez@liceo.edu.ve')).toBe('no llegó a ***@liceo.edu.ve');
        // Lo corto no se toca: horas, años, cantidades.
        expect(taparEnTexto('3 de 2026 en 120 ms')).toBe('3 de 2026 en 120 ms');
    });

    it('REGISTRO-02: contraseñas, llaves y cookies no salen nunca; lo demás se tapa por dentro', () => {
        const fuera = taparDatos({
            userId: '12345678',
            password: 'Secreta123!',
            refreshToken: 'abc.def.ghi',
            headers: { authorization: 'Bearer x', cookie: 'refresh=y', host: 'liceo.gestiedu.com' },
            alumnos: [{ id: '87654321', email: 'mama@gmail.com' }],
            cuantos: 12,
        }) as any;
        expect(fuera.userId).toBe('*****678');
        expect(fuera.password).toBe('[oculto]');
        expect(fuera.refreshToken).toBe('[oculto]');
        expect(fuera.headers).toEqual({ authorization: '[oculto]', cookie: '[oculto]', host: 'liceo.gestiedu.com' });
        expect(fuera.alumnos).toEqual([{ id: '*****321', email: '***@gmail.com' }]);
        expect(fuera.cuantos).toBe(12);
    });

    it('REGISTRO-03: el registro de verdad (winston) sale tapado', () => {
        const escrito: string[] = [];
        const { logger } = require('../utils/logger');
        const winston = require('winston');
        const espia = new winston.transports.Stream({
            stream: new (require('stream').Writable)({
                write: (t: Buffer, _c: string, listo: () => void) => {
                    escrito.push(t.toString());
                    listo();
                },
            }),
        });
        logger.add(espia);
        try {
            logger.warn('No se pudo avisar a 12345678 (ana@liceo.edu.ve)', { studentId: '12345678', password: 'x1' });
        } finally {
            logger.remove(espia);
        }
        const todo = escrito.join('');
        expect(todo).not.toMatch(/12345678|ana@|x1/);
        expect(todo).toMatch(/\*\*\*\*\*678/);
    });
});
