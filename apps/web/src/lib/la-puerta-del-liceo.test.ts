import { elLiceoDeLaCookie, laPuertaDelLiceo } from './la-puerta-del-liceo';

/**
 * QUIEN SE QUEDA SIN SESIÓN NO PUEDE ACABAR EN UN 404
 *
 * `/login` sin liceo responde «esta dirección no existe». Pasaba en el sitio
 * más frecuente de todos: cuando la sesión caduca sola, después de dejar la
 * pestaña abierta un rato.
 */
describe('La puerta del liceo', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('saca el liceo de la cookie', () => {
        expect(elLiceoDeLaCookie('institute_slug=sanmiguel')).toBe('sanmiguel');
        expect(elLiceoDeLaCookie('otra=1; institute_slug=sanmiguel; mas=2')).toBe('sanmiguel');
    });

    it('lo devuelve tal cual aunque venga escapado', () => {
        expect(elLiceoDeLaCookie('institute_slug=san%20miguel')).toBe('san miguel');
    });

    it('sin cookie y sin haber visto ninguno, no hay liceo', () => {
        expect(elLiceoDeLaCookie('')).toBeNull();
        expect(elLiceoDeLaCookie('otra=1')).toBeNull();
        expect(elLiceoDeLaCookie('institute_slug=')).toBeNull();
    });

    it('cuando la cookie ya no está, vale el último que se vio', () => {
        // Esto es lo que pasa al cerrar sesión: el borrado se lleva la cookie
        // y lo que llega después —una petición tardía que responde 401— se
        // quedaba sin liceo y mandaba al 404.
        expect(elLiceoDeLaCookie('institute_slug=sanmiguel')).toBe('sanmiguel');
        expect(elLiceoDeLaCookie('')).toBe('sanmiguel');
        expect(laPuertaDelLiceo('')).toBe('/login?slug=sanmiguel');
    });

    it('la puerta lleva el liceo en la dirección', () => {
        expect(laPuertaDelLiceo('institute_slug=sanmiguel')).toBe('/login?slug=sanmiguel');
    });

    it('y si no se sabe cuál es, se manda a /login, que es lo único que queda', () => {
        expect(laPuertaDelLiceo('')).toBe('/login');
    });

    it('un liceo con caracteres raros va escapado, no roto', () => {
        expect(laPuertaDelLiceo('institute_slug=san%20miguel')).toBe('/login?slug=san%20miguel');
    });
});
