import { deQuienNosFiamos, comoSeExplicaLaConfianza } from '../../src/config/de-quien-nos-fiamos';

/**
 * DE QUIÉN NOS FIAMOS CUANDO DICE DESDE DÓNDE LLAMA
 *
 * El servidor estaba con `trustProxy: true`: se fiaba de **cualquiera** que
 * dijera desde qué dirección llamaba. Esa dirección la escribe quien llama, en
 * una cabecera, y con ella se cuentan los intentos de entrar.
 *
 * O sea: los límites por dirección se esquivaban cambiando un número. Se
 * comprobó — quince contraseñas contra la misma cuenta, cada una diciendo venir
 * de otra dirección, y las quince pasaron el contador por dirección.
 *
 * Ahora solo se acepta esa cabecera **de quien está dentro** (el repartidor que
 * va delante en producción). De fuera se ignora y se usa la dirección de verdad.
 */

describe('De quién nos fiamos cuando dice desde dónde llama', () => {
    const anterior = process.env.TRUSTED_PROXIES;

    afterEach(() => {
        if (anterior === undefined) delete process.env.TRUSTED_PROXIES;
        else process.env.TRUSTED_PROXIES = anterior;
    });

    it('FIAR-01: sin configurar nada, solo se acepta de dentro', () => {
        delete process.env.TRUSTED_PROXIES;
        const confianza = deQuienNosFiamos();

        expect(Array.isArray(confianza)).toBe(true);
        const lista = confianza as string[];

        // La propia máquina y los rangos privados: donde vive el repartidor y
        // donde no puede estar un cliente de internet.
        expect(lista).toContain('127.0.0.1');
        expect(lista).toContain('10.0.0.0/8');
        expect(lista).toContain('172.16.0.0/12');
        expect(lista).toContain('192.168.0.0/16');

        // Y sobre todo: NO es "de cualquiera".
        expect(confianza).not.toBe(true);
    });

    it('FIAR-02: ya no se acepta de cualquiera por defecto', () => {
        // Este es el cambio. Si alguien vuelve a poner `true` como valor por
        // defecto, se cae aquí: los límites por dirección dejarían de servir.
        delete process.env.TRUSTED_PROXIES;
        expect(deQuienNosFiamos()).not.toBe(true);
    });

    it('FIAR-03: se puede apagar del todo', () => {
        process.env.TRUSTED_PROXIES = 'false';
        expect(deQuienNosFiamos()).toBe(false);
    });

    it('FIAR-04: se puede decir exactamente de quién', () => {
        process.env.TRUSTED_PROXIES = '10.1.2.3, 10.1.2.4';
        expect(deQuienNosFiamos()).toEqual(['10.1.2.3', '10.1.2.4']);
    });

    it('FIAR-05: la escotilla existe, pero avisa de lo que significa', () => {
        process.env.TRUSTED_PROXIES = 'true';
        const confianza = deQuienNosFiamos();

        expect(confianza).toBe(true);
        // Quien la use tiene que leer en el registro lo que acaba de hacer.
        const explicacion = comoSeExplicaLaConfianza(confianza);
        expect(explicacion).toMatch(/AVISO/);
        expect(explicacion).toMatch(/CUALQUIERA/i);
    });

    it('FIAR-06: una lista vacía no deja el sistema sin defensa', () => {
        // `TRUSTED_PROXIES=" , , "` es un descuido de configuración. Lo que no
        // puede hacer es acabar en "de cualquiera".
        process.env.TRUSTED_PROXIES = ' , , ';
        const confianza = deQuienNosFiamos();

        expect(confianza).not.toBe(true);
        expect(Array.isArray(confianza)).toBe(true);
        expect((confianza as string[]).length).toBeGreaterThan(0);
    });

    it('FIAR-07: la explicación dice de quién se acepta, para poder revisarlo', () => {
        process.env.TRUSTED_PROXIES = '10.9.9.9';
        expect(comoSeExplicaLaConfianza(deQuienNosFiamos())).toContain('10.9.9.9');
    });
});
