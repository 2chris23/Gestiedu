import { deQuienEs, leerLoDescargado, MAXIMO_DE_DIAS } from './lo-guardado-en-el-telefono';

/**
 * DE QUIÉN ES LO QUE SE GUARDÓ EN EL TELÉFONO
 *
 * Lo que se descarga se guarda para verlo sin señal. La pregunta que decide si
 * eso está bien o es un agujero es una sola: **¿de quién es?** Un teléfono se
 * presta, y un ordenador del liceo lo usan veinte personas.
 */
describe('Lo guardado en el teléfono', () => {
    describe('de quién es', () => {
        it('lleva el liceo y la cédula', () => {
            expect(deQuienEs('sanmiguel', 'V-12345678')).toBe('sanmiguel:V-12345678');
        });

        it('la misma persona en otro liceo es otra llave', () => {
            expect(deQuienEs('sanmiguel', 'V-1')).not.toBe(deQuienEs('otroliceo', 'V-1'));
        });

        it('dos personas del mismo liceo, tampoco comparten', () => {
            expect(deQuienEs('sanmiguel', 'V-1')).not.toBe(deQuienEs('sanmiguel', 'V-2'));
        });

        it('sin sesión no hay dueño, así que no se guarda nada', () => {
            expect(deQuienEs('sanmiguel', null)).toBeNull();
            expect(deQuienEs(null, 'V-1')).toBeNull();
            expect(deQuienEs(undefined, undefined)).toBeNull();
            expect(deQuienEs('', '')).toBeNull();
        });
    });

    describe('cuándo se devuelve', () => {
        it('sin dueño no se devuelve nada, ni se mira', async () => {
            await expect(leerLoDescargado(null)).resolves.toBeNull();
        });

        it('donde no se puede guardar (ventana privada), falla cerrado', async () => {
            // En este entorno no hay IndexedDB, igual que en una ventana
            // privada con los datos del sitio bloqueados: no se devuelve nada
            // en vez de reventar la pantalla.
            await expect(leerLoDescargado('sanmiguel:V-1')).resolves.toBeNull();
        });
    });

    it('lo guardado caduca: una semana', () => {
        // Un horario de hace tres semanas no es información, es una trampa.
        expect(MAXIMO_DE_DIAS).toBe(7);
    });
});
