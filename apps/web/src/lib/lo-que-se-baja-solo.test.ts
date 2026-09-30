import { laSemanaDe, loDelAlumno, loDelProfesor } from './lo-que-se-baja-solo';
import { claveDeLaPeticion, seGuarda } from './respuestas-guardadas';
import { hoyDelLiceo } from '@/hooks/useSchoolTime';

/**
 * LO QUE SE BAJA SOLO (2026-09-30)
 *
 * Sin conexión, una pantalla pide SU dirección y se le contesta con lo
 * guardado de esa misma dirección. Si la descarga en segundo plano guardara
 * otra (otros parámetros, otro orden), la pantalla saldría vacía: por eso se
 * comprueba que coincidan con las de los ganchos.
 */
describe('Lo que se baja solo', () => {
    it('la semana del liceo va de lunes a viernes', () => {
        expect(laSemanaDe('2026-09-30')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
        expect(laSemanaDe('2026-10-04')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    });

    it('el profesor: cada clase de la semana, hoy primero, con la dirección de su horario', () => {
        const cs = (c: string, m: string) => ({ classroom: { id: c }, subject: { id: m } });
        const plan = loDelProfesor(
            'profe1',
            [
                { dayOfWeek: 1, startTime: '07:00', endTime: '07:45', classroomSubject: cs('secA', 'mat') },
                { dayOfWeek: 3, startTime: '08:30', endTime: '09:15', classroomSubject: cs('secB', 'fis') },
                { dayOfWeek: 3, startTime: '07:00', endTime: '07:45', classroomSubject: cs('secA', 'mat') },
                { dayOfWeek: 6, startTime: '07:00', endTime: '07:45', classroomSubject: cs('secA', 'mat') },
            ],
            '2026-09-30'
        );
        const detalles = plan.lecturas.filter((l) => l.url === '/sessions/live-detail').map((l) => l.params);
        expect(detalles[0]).toEqual({ classroomId: 'secA', subjectId: 'mat', date: '2026-09-30' });
        expect(detalles[1]).toEqual({ classroomId: 'secB', subjectId: 'fis', date: '2026-09-30' });
        expect(detalles[2]).toEqual({ classroomId: 'secA', subjectId: 'mat', date: '2026-09-28' });
        expect(detalles).toHaveLength(3); // el sábado no es día de clase
        expect(plan.lecturas.filter((l) => l.url === '/sessions/activities')).toHaveLength(2);
        expect(plan.pantallas).toContain('/dashboard/clase-en-vivo/secA/mat?date=2026-09-30&start=07%3A00&end=07%3A45');
    });

    it('el alumno: cada materia, su pantalla de «Mi clase» y su boleta', () => {
        const plan = loDelAlumno('al1', 'secA', [{ id: 'mat' }, { id: 'fis' }]);
        expect(plan.lecturas.map((l) => l.url)).toEqual(
            expect.arrayContaining(['/students/al1/materias/mat/clase', '/students/al1/materias/fis/clase', '/students/al1/boleta', '/schedules/classroom/secA'])
        );
        expect(plan.pantallas).toEqual(expect.arrayContaining(['/dashboard/mi-clase/mat', '/dashboard/boleta/mia']));
    });
});

describe('La llave de una respuesta guardada', () => {
    it('da igual el orden de los parámetros, o si van en la dirección', () => {
        const a = claveDeLaPeticion('/sessions/live-detail', { classroomId: 'c', subjectId: 's', date: 'd' });
        const b = claveDeLaPeticion('/sessions/live-detail?date=d', { subjectId: 's', classroomId: 'c' });
        expect(a).toBe(b);
    });

    it('lo que no se guarda: la hora, renovar la sesión, la salud', () => {
        expect(seGuarda('/time')).toBe(false);
        expect(seGuarda('/auth/refresh')).toBe(false);
        expect(seGuarda('/health')).toBe(false);
        expect(seGuarda('/sessions/live-detail?date=d')).toBe(true);
    });
});

describe('Hoy, sin conexión', () => {
    const respuesta = { now: '2026-09-29T20:00:00.000Z', date: '2026-09-29', time: '16:00', timezone: 'America/Caracas' };
    const respondio = Date.parse('2026-09-29T20:00:00.000Z');

    it('al día siguiente sin señal, hoy es el día siguiente (no el de la última respuesta)', () => {
        expect(hoyDelLiceo(respuesta, respondio, respondio + 12 * 3600e3)).toBe('2026-09-30');
    });

    it('el reloj del teléfono atrasado no retrocede el día', () => {
        expect(hoyDelLiceo(respuesta, respondio, respondio - 48 * 3600e3)).toBe('2026-09-29');
    });
});
