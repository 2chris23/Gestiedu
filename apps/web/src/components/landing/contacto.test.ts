import { abreFuera, contactoDemo, direccionDelSitio } from './contacto';

describe('La portada, lo que pone quien despliega', () => {
    it('sin contacto, no hay botón', () => {
        expect(contactoDemo(undefined)).toBeUndefined();
        expect(contactoDemo('   ')).toBeUndefined();
    });

    it('acepta WhatsApp, una página https y un correo', () => {
        expect(contactoDemo('https://wa.me/584120000000')).toBe('https://wa.me/584120000000');
        expect(contactoDemo(' mailto:ventas@ejemplo.com ')).toBe('mailto:ventas@ejemplo.com');
    });

    it('rechaza lo que no abre algo razonable', () => {
        expect(contactoDemo('javascript:alert(1)')).toBeUndefined();
        expect(contactoDemo('http://ejemplo.com')).toBeUndefined();
        expect(contactoDemo('wa.me/58412')).toBeUndefined();
    });

    it('la dirección del sitio, solo https (o localhost para probar)', () => {
        expect(direccionDelSitio(undefined)).toBeUndefined();
        expect(direccionDelSitio('no es una dirección')).toBeUndefined();
        expect(direccionDelSitio('http://ejemplo.com')).toBeUndefined();
        expect(direccionDelSitio('https://ejemplo.com')?.href).toBe('https://ejemplo.com/');
        expect(direccionDelSitio('http://localhost:3000')?.host).toBe('localhost:3000');
    });

    it('WhatsApp se abre aparte; un correo no', () => {
        expect(abreFuera('https://wa.me/58412')).toBe(true);
        expect(abreFuera('mailto:a@b.c')).toBe(false);
    });
});
