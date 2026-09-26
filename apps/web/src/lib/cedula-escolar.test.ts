import { armarCedulaEscolar, esCedulaEscolar, cedulaEscolarLegible } from './cedula-escolar';

/**
 * La cédula escolar (instructivo del MPPE): V/E + orden del parto + dos
 * dígitos del año de nacimiento + la cédula de la madre en 8 dígitos. La misma
 * cuenta está en el servidor (`apps/backend/src/tests/services/cedula-escolar.test.ts`).
 */
describe('Cédula escolar', () => {
    it('CED-01: se arma con sus cuatro partes; la cédula de 7 dígitos lleva un 0 delante', () => {
        expect(armarCedulaEscolar({ nacionalidad: 'V', ordenDelParto: 1, anioDeNacimiento: 2012, cedulaDeLaMadre: '12.345.678' })).toEqual({ cedula: 'V11212345678' });
        expect(armarCedulaEscolar({ nacionalidad: 'E', ordenDelParto: 2, anioDeNacimiento: 2009, cedulaDeLaMadre: '8765432' })).toEqual({ cedula: 'E20908765432' });
    });

    it('CED-02: lo que no cuadra se dice', () => {
        expect(armarCedulaEscolar({ nacionalidad: 'X' as any, ordenDelParto: 1, anioDeNacimiento: 2012, cedulaDeLaMadre: '12345678' })).toHaveProperty('error');
        expect(armarCedulaEscolar({ nacionalidad: 'V', ordenDelParto: 0, anioDeNacimiento: 2012, cedulaDeLaMadre: '12345678' })).toHaveProperty('error');
        expect(armarCedulaEscolar({ nacionalidad: 'V', ordenDelParto: 1, anioDeNacimiento: 12, cedulaDeLaMadre: '12345678' })).toHaveProperty('error');
        expect(armarCedulaEscolar({ nacionalidad: 'V', ordenDelParto: 1, anioDeNacimiento: 2012, cedulaDeLaMadre: '123' })).toHaveProperty('error');
    });

    it('CED-03: se reconoce y se lee con guiones; una cédula de identidad no es escolar', () => {
        expect(esCedulaEscolar('V11212345678')).toBe(true);
        expect(esCedulaEscolar('v11212345678')).toBe(true);
        expect(esCedulaEscolar('V-20000575')).toBe(false);
        expect(esCedulaEscolar('12345678')).toBe(false);
        expect(cedulaEscolarLegible('V11212345678')).toBe('V-1-12-12345678');
        expect(cedulaEscolarLegible('V-20000575')).toBe('V-20000575');
    });
});
