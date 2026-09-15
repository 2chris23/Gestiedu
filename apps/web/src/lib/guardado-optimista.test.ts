import {
    recordarPendiente,
    olvidarPendiente,
    guardadosPendientes,
    hayPendientes,
} from './guardado-optimista';

/**
 * LO QUE NO SE PUDO GUARDAR, NO SE PIERDE
 *
 * El guardado optimista pinta la nota antes de que el servidor conteste. Eso
 * hace que el profesor no espere, pero abre un riesgo: si el guardado falla y la
 * pantalla vuelve atrás, la nota escrita **se esfumaría**.
 *
 * Estas pruebas cubren la red que impide eso. Si se caen, el profesor pierde
 * trabajo escrito — que es exactamente lo que este sistema no puede hacer.
 */

const LLAVE = 'gestiedu:guardados-pendientes';

const unPendiente = (id: string, cuando = Date.now()) => ({
    id,
    que: 'Calificaciones de una actividad',
    ruta: `/sessions/activities/${id}/grades`,
    carga: { scores: { 'alumno-1': 18 } },
    cuando,
});

describe('Lo que no se pudo guardar, no se pierde', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('GUA-01: un guardado fallido queda apuntado con su contenido entero', () => {
        recordarPendiente(unPendiente('act-1'));

        const [p] = guardadosPendientes();
        expect(p).toBeTruthy();
        expect(p.id).toBe('act-1');
        expect((p.carga as any).scores['alumno-1']).toBe(18);
        expect(p.ruta).toContain('/sessions/activities/act-1/grades');
    });

    it('GUA-02: sobrevive a que se cierre y se vuelva a abrir la aplicación', () => {
        recordarPendiente(unPendiente('act-2'));

        // Se simula recargar: el módulo vuelve a leer del almacenamiento.
        const guardado = window.localStorage.getItem(LLAVE);
        expect(guardado).toBeTruthy();
        expect(JSON.parse(guardado as string)).toHaveLength(1);
        expect(guardadosPendientes()[0].id).toBe('act-2');
    });

    it('GUA-03: cuando por fin se guarda, se olvida', () => {
        recordarPendiente(unPendiente('act-3'));
        expect(hayPendientes()).toBe(true);

        olvidarPendiente('act-3');

        expect(hayPendientes()).toBe(false);
        expect(guardadosPendientes()).toHaveLength(0);
    });

    it('GUA-04: reintentar la misma actividad no la duplica, la actualiza', () => {
        recordarPendiente(unPendiente('act-4', 1000));
        recordarPendiente({ ...unPendiente('act-4', 2000), carga: { scores: { 'alumno-1': 20 } } });

        const lista = guardadosPendientes();
        expect(lista).toHaveLength(1);
        expect((lista[0].carga as any).scores['alumno-1']).toBe(20);
    });

    it('GUA-05: se atienden de lo más viejo a lo más nuevo', () => {
        recordarPendiente(unPendiente('act-nueva', 3000));
        recordarPendiente(unPendiente('act-vieja', 1000));
        recordarPendiente(unPendiente('act-media', 2000));

        expect(guardadosPendientes().map((p) => p.id)).toEqual([
            'act-vieja',
            'act-media',
            'act-nueva',
        ]);
    });

    it('GUA-06: si el almacenamiento está roto, no se rompe la pantalla', () => {
        // Ventana privada, permisos bloqueados… El sistema tiene que seguir
        // funcionando aunque no pueda apuntar nada.
        const original = window.localStorage.getItem;
        (window.localStorage as any).getItem = () => {
            throw new Error('almacenamiento bloqueado');
        };

        expect(() => guardadosPendientes()).not.toThrow();
        expect(guardadosPendientes()).toEqual([]);

        (window.localStorage as any).getItem = original;
    });

    it('GUA-07: contenido corrupto no tumba nada', () => {
        window.localStorage.setItem(LLAVE, 'esto no es json');

        expect(() => guardadosPendientes()).not.toThrow();
        expect(guardadosPendientes()).toEqual([]);
    });
});
