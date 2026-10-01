import { juntar, ordenar, esperaTras, type CambioPendiente } from './por-enviar';
import { conLoPendiente } from './lo-pendiente-de-la-clase';

/**
 * LO QUE ESPERA PARA SUBIR (2026-09-30)
 *
 * Las reglas de Cristian: al volver la conexión, primero lo que agrega y lo
 * que borra al final; y lo repetido se junta, sin perder lo que se vio.
 */
let n = 0;
const c = (x: Partial<CambioPendiente>): CambioPendiente => ({
    id: `c${++n}`,
    dueno: 'liceo:profe',
    tipo: 'notas',
    grupo: 3,
    metodo: 'post',
    url: '/x',
    objeto: 'actividad|a1',
    resumen: '',
    hechoEn: new Date().toISOString(),
    orden: n,
    estado: 'pendiente',
    intentos: 0,
    ...x,
});

describe('La cola de lo pendiente', () => {
    it('sube en orden: plan, crear, cambiar y lo que borra al final', () => {
        const borrar = c({ tipo: 'borrar-actividad', grupo: 4 });
        const notas = c({ tipo: 'notas', grupo: 3 });
        const crear = c({ tipo: 'crear-actividad', grupo: 2 });
        const plan = c({ tipo: 'plan', grupo: 1 });
        expect(ordenar([borrar, notas, crear, plan]).map((x) => x.tipo)).toEqual(['plan', 'crear-actividad', 'notas', 'borrar-actividad']);
    });

    it('tres notas al mismo alumno son una: la última, con lo que se vio la primera vez', () => {
        let cola = juntar([], c({ datos: { scores: { ana: 10 }, antes: { ana: null } } }));
        cola = juntar(cola, c({ datos: { scores: { ana: 15, beto: 12 }, antes: { ana: 10, beto: 8 } } }));
        expect(cola).toHaveLength(1);
        expect(cola[0].datos.scores).toEqual({ ana: 15, beto: 12 });
        expect(cola[0].datos.antes).toEqual({ ana: null, beto: 8 });
    });

    it('la asistencia: vale la última marca; «solo si no hay» no pisa lo marcado a mano', () => {
        const obj = 'clase|s|m|2026-09-30';
        let cola = juntar([], c({ tipo: 'asistencia', objeto: obj, datos: { attendances: [{ studentId: 'ana', status: 'ABSENT', antes: 'PRESENT' }] } }));
        cola = juntar(cola, c({ tipo: 'asistencia', objeto: obj, datos: { attendances: [{ studentId: 'ana', status: 'LATE', antes: 'ABSENT' }, { studentId: 'beto', status: 'PRESENT', soloSiNoHay: true }] } }));
        expect(cola[0].datos.attendances).toEqual([
            { studentId: 'ana', status: 'LATE', antes: 'PRESENT' },
            { studentId: 'beto', status: 'PRESENT', soloSiNoHay: true },
        ]);
    });

    it('crear y borrar sin conexión se anulan, con todo lo que se le hizo', () => {
        let cola = juntar([], c({ tipo: 'crear-actividad', grupo: 2, objeto: 'actividad|nueva' }));
        cola = juntar(cola, c({ tipo: 'notas', objeto: 'actividad|nueva', datos: { scores: { ana: 20 } } }));
        cola = juntar(cola, c({ tipo: 'borrar-actividad', grupo: 4, objeto: 'actividad|nueva' }));
        expect(cola).toEqual([]);
    });

    it('lo de otro dueño no se junta, y lo que está por decidir no se toca', () => {
        let cola = juntar([], c({ estado: 'hay-que-decidir', datos: { scores: { ana: 1 } } }));
        cola = juntar(cola, c({ dueno: 'liceo:otro', datos: { scores: { ana: 2 } } }));
        cola = juntar(cola, c({ datos: { scores: { ana: 3 } } }));
        expect(cola).toHaveLength(3);
    });

    it('tras un fallo de red, se espera cada vez más (hasta 5 min)', () => {
        expect(esperaTras(1)).toBe(5000);
        expect(esperaTras(3)).toBe(20000);
        expect(esperaTras(20)).toBe(300000);
    });
});

describe('La clase con lo pendiente encima', () => {
    const datos = {
        subject: { id: 'm' },
        students: [
            { id: 'ana', status: 'PRESENT' },
            { id: 'beto', status: null },
        ],
        activities: [
            { id: 'a1', title: 'Taller', scores: { ana: 10 } },
            { id: 'a2', title: 'Quiz', scores: {} },
        ],
    };

    it('asistencia, notas, actividades nuevas y sin las borradas, todo marcado como pendiente', () => {
        const cola = [
            c({ tipo: 'asistencia', objeto: 'clase|s|m|2026-09-30', datos: { attendances: [{ studentId: 'ana', status: 'ABSENT' }, { studentId: 'beto', status: 'PRESENT', soloSiNoHay: true }] } }),
            c({ tipo: 'notas', objeto: 'actividad|a1', datos: { scores: { beto: 18 } } }),
            c({ tipo: 'borrar-actividad', grupo: 4, objeto: 'actividad|a2' }),
            c({ tipo: 'crear-actividad', grupo: 2, objeto: 'actividad|n1', datos: { id: 'n1', title: 'Nueva', classroomId: 's', subjectId: 'm', date: '2026-09-30' } }),
        ];
        const r: any = conLoPendiente(datos, cola, 's', 'm', '2026-09-30');
        expect(r.students).toEqual([
            { id: 'ana', status: 'ABSENT', pendiente: true },
            { id: 'beto', status: null },
        ]);
        expect(r.activities.map((a: any) => a.id)).toEqual(['a1', 'n1']);
        expect(r.activities[0].scores).toEqual({ ana: 10, beto: 18 });
        expect(r.activities[1]).toMatchObject({ pendiente: true, belongsToSession: true });
    });

    it('lo de otra clase o de otro día no se mezcla', () => {
        const cola = [c({ tipo: 'asistencia', objeto: 'clase|s|m|2026-09-29', datos: { attendances: [{ studentId: 'ana', status: 'ABSENT' }] } })];
        expect((conLoPendiente(datos, cola, 's', 'm', '2026-09-30') as any).students[0].status).toBe('PRESENT');
    });
});
