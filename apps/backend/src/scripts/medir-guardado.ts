/**
 * CUÁNTO TARDA GUARDAR, QUE ES LO QUE HACE EL PROFESOR TODO EL DÍA
 *
 * Hasta ahora se había medido lo que tarda **abrir** cada pantalla. Pero un
 * profesor no se pasa el día abriendo pantallas: se lo pasa **guardando** —
 * notas, asistencia—, y eso no estaba medido con números que sirvieran.
 *
 * (Sí se midió en su día con k6: salieron 3.458 ms de media. Pero el generador
 * corría en la misma máquina que el servidor y que la base, así que aquello
 * medía el PC. Está anotado en la auditoría.)
 *
 * Aquí el generador casi no gasta: lo que se mide es el servidor.
 *
 * Todo lo que se escribe se borra al final. Corre contra el liceo de pruebas.
 */
import { platformPrisma, getTenantPrisma } from '../config/database';
import { guardarMedicion } from './guardar-medicion';

const API = process.env.API_BASE || 'http://localhost:3001/api';
const SLUG = process.env.LICEO || 'instituto-testing';
const VECES = Number(process.env.VECES || 10);

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

async function entrar(email: string) {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
        body: JSON.stringify({ email, password: '123456' }),
    });
    if (!res.ok) throw new Error(`no se pudo entrar como ${email}: ${res.status}`);
    return ((await res.json()) as any).tokens.accessToken as string;
}

async function main() {
    const inst = await platformPrisma.institute.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!inst) { console.error('no existe el liceo'); process.exit(1); }
    const db = await getTenantPrisma(inst.id);

    const anio: any = await db.academicYear.findFirst({ where: { status: 'ACTIVE' as any }, select: { id: true } });
    const lapso: any = await db.period.findFirst({ where: { academicYearId: anio?.id }, select: { id: true } });
    const cs: any = await db.classroomSubject.findFirst({
        where: { classroom: { academicYearId: anio?.id }, teacherId: { not: null } },
        select: { classroomId: true, subjectId: true, teacher: { select: { id: true, email: true } } },
    });
    const alumnos: any[] = await db.studentClassroom.findMany({
        where: { classroomId: cs?.classroomId, isActive: true },
        select: { studentId: true },
        take: 30,
    });

    if (!cs?.teacher?.email || alumnos.length === 0) {
        console.error('faltan datos en el liceo de pruebas para medir el guardado');
        process.exit(1);
    }

    const token = await entrar(cs.teacher.email);
    const cabeceras = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    };

    const actividad: any = await db.activity.findFirst({
        where: { classroomId: cs.classroomId, subjectId: cs.subjectId },
        select: { id: true },
    });
    if (!actividad) {
        console.error('no hay ninguna actividad en esa sección para medir el guardado de notas');
        process.exit(1);
    }

    /**
     * ANTES DE MEDIR, LA PIZARRA LIMPIA
     *
     * La medición escribe notas de verdad. Si quedaran de una corrida anterior,
     * la siguiente respondería "ya existe una calificación" —que es lo correcto,
     * y está probado— pero no se podría medir nada.
     *
     * Se quitan **solo las de esta actividad y estos alumnos**, que es
     * exactamente lo que escribe la medición. Nada más se toca.
     */
    const { borrarGuardandoCopia } = await import('../utils/papelera');
    const deLaMedicion = {
        activityId: actividad.id,
        studentId: { in: alumnos.map((a) => a.studentId) },
    };
    const quien = { userId: 'medicion', nombre: 'medición de rendimiento' } as any;

    const habia = await db.grade.count({ where: deLaMedicion });
    if (habia > 0) await borrarGuardandoCopia(db as any, 'grade', deLaMedicion, quien);

    /**
     * GUARDAR LAS NOTAS DE TODA LA SECCIÓN, VARIAS VECES DE VERDAD
     *
     * Guardar dos veces las mismas notas responde 409 —correcto: ya están
     * puestas— así que de diez vueltas solo la primera medía algo, y esa
     * primera es siempre la más lenta (la primera de todo paga el arranque).
     * Salían números que no se repetían: 28 ms una vez, 181 otra.
     *
     * Ahora **antes de cada vuelta se recoge lo de la anterior**, así que las
     * diez guardan de verdad y el número se puede repetir.
     */
    const lotes: number[] = [];
    for (let i = 0; i < VECES + 1; i++) {
        const habiaAntes = await db.grade.count({ where: deLaMedicion });
        if (habiaAntes > 0) await borrarGuardandoCopia(db as any, 'grade', deLaMedicion, quien);

        const t = Date.now();
        const res = await fetch(`${API}/grades/bulk`, {
            method: 'POST',
            headers: cabeceras,
            body: JSON.stringify({
                grades: alumnos.map((a) => ({
                    studentId: a.studentId,
                    activityId: actividad.id,
                    subjectId: cs.subjectId,
                    periodId: lapso?.id,
                    score: 10 + (i % 10),
                })),
            }),
        });
        const cuerpo: any = await res.json().catch(() => ({}));

        // La primera no cuenta: paga el arranque de todo lo que toca.
        if (res.ok && i > 0) lotes.push(Date.now() - t);
        else if (!res.ok && i === 0) {
            console.log(`    (guardar notas respondió ${res.status}: ${JSON.stringify(cuerpo).slice(0, 200)})`);
        }
    }

    // ── Una sola nota, que es lo que se corrige a mano ───────────────────────
    const sueltas: number[] = [];
    for (let i = 0; i < VECES; i++) {
        const t = Date.now();
        const res = await fetch(`${API}/grades`, {
            method: 'POST',
            headers: cabeceras,
            body: JSON.stringify({
                studentId: alumnos[i % alumnos.length].studentId,
                activityId: actividad.id,
                subjectId: cs.subjectId,
                periodId: lapso?.id,
                score: 12 + (i % 6),
            }),
        });
        const cuerpo: any = await res.json().catch(() => ({}));
        if (res.ok) sueltas.push(Date.now() - t);
        else if (i === 0) console.log(`    (una nota respondió ${res.status}: ${JSON.stringify(cuerpo).slice(0, 170)})`);
    }

    /**
     * LO QUE YA HABÍA, APUNTADO ANTES DE TOCAR NADA
     *
     * La limpieza de esta medición borraba la asistencia **por rango de
     * fechas**. Sonaba razonable y estaba mal: en ese rango también hay
     * asistencia sembrada, y se la llevó por delante — 348 filas que no eran
     * suyas. Se recuperaron de la papelera, que para eso está, pero el susto
     * sobra.
     *
     * Ahora se apunta qué filas existían ANTES y al final se borran solo las
     * que no estaban. Lo que no escribió esta medición, no lo toca.
     */
    const asistenciaQueYaHabia = new Set(
        (
            await db.dailyAttendance.findMany({
                where: { classroomId: cs.classroomId },
                select: { id: true },
            })
        ).map((a) => a.id)
    );

    // ── Pasar asistencia a toda la sección ──────────────────────────────────
    //
    // Es el otro gesto diario del profesor, y el que más prisa tiene: se hace
    // al empezar la clase, con los alumnos esperando.
    const asistencias: number[] = [];
    for (let i = 0; i < VECES; i++) {
        const t = Date.now();
        const res = await fetch(`${API}/attendance/bulk`, {
            method: 'POST',
            headers: cabeceras,
            body: JSON.stringify({
                classroomId: cs.classroomId,
                /**
                 * Fechas de hace años, a propósito.
                 *
                 * Con fechas recientes la asistencia **ya existe** —está
                 * sembrada— y el sistema la actualiza en vez de crearla. Eso
                 * cambia datos de verdad (un presente pasa a ausente) y encima
                 * mide otra cosa: corregir, no pasar lista.
                 *
                 * Con fechas de hace tres años no hay nada que pisar: se crea,
                 * que es lo que se quiere medir, y al final se borra lo creado.
                 */
                date: new Date(Date.now() - (1100 + i) * 864e5).toISOString().slice(0, 10),
                attendances: alumnos.map((a, n) => ({
                    studentId: a.studentId,
                    status: n % 9 === 0 ? 'ABSENT' : 'PRESENT',
                })),
            }),
        });
        const cuerpo: any = await res.json().catch(() => ({}));
        if (res.ok) asistencias.push(Date.now() - t);
        else if (i === 0) console.log(`    (asistencia respondió ${res.status}: ${JSON.stringify(cuerpo).slice(0, 170)})`);
    }

    const fila = (nombre: string, xs: number[], detalle = '') => {
        if (xs.length === 0) { console.log('  ' + nombre.padEnd(38) + '  (no se pudo medir)'); return; }
        console.log(
            '  ' + nombre.padEnd(38) +
            `${percentil(xs, 50)}`.padStart(6) + 'ms' +
            `${percentil(xs, 95)}`.padStart(7) + 'ms' +
            `${Math.max(...xs)}`.padStart(7) + 'ms' +
            (detalle ? '   ' + detalle : '')
        );
    };

    console.log(`\n  Guardar, medido contra el servidor · ${VECES} veces cada uno\n`);
    console.log('  ' + 'acción'.padEnd(38) + 'p50'.padStart(8) + 'p95'.padStart(9) + 'peor'.padStart(9));
    console.log('  ' + '─'.repeat(66));
    fila(`guardar las notas de ${alumnos.length} alumnos de una vez`, lotes,
        lotes.length ? `${(percentil(lotes, 50) / alumnos.length).toFixed(1)} ms por alumno` : '');
    fila('corregir una nota suelta', sueltas);
    fila(`pasar asistencia de ${alumnos.length} alumnos`, asistencias,
        asistencias.length ? `${(percentil(asistencias, 50) / alumnos.length).toFixed(1)} ms por alumno` : '');
    console.log('');

    // ── Se recoge lo que escribió la medición ───────────────────────────────
    //
    // Por la vía normal: la papelera guarda copia, como todo en este sistema.
    const dejadas = await db.grade.count({ where: deLaMedicion });
    if (dejadas > 0) await borrarGuardandoCopia(db as any, 'grade', deLaMedicion, quien);

    // Solo la asistencia que escribió ESTA medición: la que no estaba antes.
    const ahoraHay = await db.dailyAttendance.findMany({
        where: { classroomId: cs.classroomId },
        select: { id: true },
    });
    const nuevas = ahoraHay.map((a) => a.id).filter((id) => !asistenciaQueYaHabia.has(id));

    let diasDejados = 0;
    if (nuevas.length > 0) {
        diasDejados = nuevas.length;
        await borrarGuardandoCopia(db as any, 'dailyAttendance', { id: { in: nuevas } }, quien);
    }

    console.log(`  Limpieza: ${dejadas} notas y ${diasDejados} asistencias de la medición recogidas.
`);

    const resumen = (xs: number[]) =>
        xs.length ? { p50: percentil(xs, 50), p95: percentil(xs, 95), peor: Math.max(...xs), veces: xs.length } : null;
    guardarMedicion('guardado', {
        liceo: SLUG,
        alumnos: alumnos.length,
        notasDeUnaVez: resumen(lotes),
        notaSuelta: resumen(sueltas),
        asistencia: resumen(asistencias),
    });

    await platformPrisma.$disconnect();
    process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
