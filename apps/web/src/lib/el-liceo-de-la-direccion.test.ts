import { elLiceoDelHost } from './el-liceo-de-la-direccion';

/**
 * UNA DIRECCIÓN DE RED NO ES UN LICEO
 *
 * Esta cuenta estaba copiada en tres sitios y solo uno sabía esto. Abriendo la
 * app en un teléfono —por la dirección del ordenador en el wifi,
 * `192.168.1.156`— el primer trozo se leía como el nombre corto del liceo y la
 * pantalla decía «el instituto 192 no está registrado». Lo mismo pasaría en un
 * servidor al que se entre por su número.
 */
describe('Qué liceo dice la dirección', () => {
    it('lo saca del subdominio', () => {
        expect(elLiceoDelHost('sanmiguel.gestiedu.com')).toBe('sanmiguel');
        expect(elLiceoDelHost('sanmiguel.localhost:3000')).toBe('sanmiguel');
        expect(elLiceoDelHost('SanMiguel.GestiEdu.com')).toBe('sanmiguel');
    });

    it('una dirección de red no nombra a ningún liceo', () => {
        expect(elLiceoDelHost('192.168.1.156')).toBeNull();
        expect(elLiceoDelHost('192.168.1.156:3000')).toBeNull();
        expect(elLiceoDelHost('10.0.5.254')).toBeNull();
        expect(elLiceoDelHost('127.0.0.1:3000')).toBeNull();
    });

    it('localhost a secas, tampoco', () => {
        expect(elLiceoDelHost('localhost')).toBeNull();
        expect(elLiceoDelHost('localhost:3000')).toBeNull();
        expect(elLiceoDelHost('gestiedu.com')).toBeNull();
    });

    it('los túneles públicos, tampoco: ese trozo cambia cada vez', () => {
        expect(elLiceoDelHost('abc-123.trycloudflare.com')).toBeNull();
        expect(elLiceoDelHost('algo.ngrok-free.app')).toBeNull();
    });

    it('www y el superadmin no son liceos', () => {
        expect(elLiceoDelHost('www.gestiedu.com')).toBeNull();
        expect(elLiceoDelHost('superadmin.gestiedu.com')).toBeNull();
        expect(elLiceoDelHost('super-admin.localhost:3000')).toBeNull();
    });

    it('sin dirección, nada', () => {
        expect(elLiceoDelHost('')).toBeNull();
        expect(elLiceoDelHost(null)).toBeNull();
        expect(elLiceoDelHost(undefined)).toBeNull();
    });
});
