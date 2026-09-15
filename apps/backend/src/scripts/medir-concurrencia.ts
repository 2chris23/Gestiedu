/**
 * QUÉ PASA CUANDO ENTRAN MUCHOS A LA VEZ
 *
 * La medición de "cuánto tarda cada pantalla" se hace de una en una, y sale
 * bien: todo por debajo de 30 ms. Pero eso no contesta la pregunta que importa
 * —*"¿aguanta un lunes a las siete?"*— porque un lunes a las siete no entra uno.
 *
 * Aquí se lanza la misma pantalla desde N sitios a la vez y se mira cómo se
 * porta: si el tiempo por persona se mantiene, el sistema está holgado; si se
 * multiplica, hay una cola en alguna parte.
 *
 * ─── LO QUE ESTA MEDIDA NO ES ────────────────────────────────────────────────
 *
 * El generador corre en la MISMA máquina que el servidor y que PostgreSQL. A
 * partir de cierto número, lo que se mide es el reparto del procesador entre
 * los tres, no el sistema. Por eso se mira también **cuánto trabajo total sale
 * por segundo**: si eso sigue subiendo, el sistema aguanta aunque el tiempo por
 * persona crezca; si se estanca, ahí está el techo de esta máquina.
 *
 * Para números de verdad del sistema hace falta el generador en otro equipo.
 * Está dicho en la auditoría y sigue pendiente.
 */
import { platformPrisma, getTenantPrisma } from '../config/database';

const API = process.env.API_BASE || 'http://localhost:3001/api';
const SLUG = process.env.LICEO || 'instituto-testing';
const A_LA_VEZ = (process.env.A_LA_VEZ || '1,10,25,50,100,200').split(',').map(Number);
const POR_TANDA = Number(process.env.POR_TANDA || 4);

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

/**
 * Cada persona entra UNA vez en toda la medición.
 *
 * Sin esto, medir con 1, 3, 6 y 12 profesores hacía entrar al primero cuatro
 * veces, y el sistema —con razón— acaba respondiendo "demasiados intentos". No
 * es un fallo del sistema: es la medición llamando de más.
 */
const credenciales = new Map<string, Promise<string>>();

function entrar(email: string): Promise<string> {
    if (!credenciales.has(email)) credenciales.set(email, entrarDeVerdad(email));
    return credenciales.get(email)!;
}

async function entrarDeVerdad(email: string) {
    /**
     * El sistema limita los intentos de entrar a diez por minuto y por cuenta.
     * Es correcto y no se toca: es lo que frena a quien prueba contraseñas.
     *
     * Medir varias veces seguidas toca ese límite sin que nadie abuse de nada,
     * así que aquí se espera a que se suelte en vez de dar la medición por
     * fallada. Es lo mismo que hacen las pruebas de navegador.
     */
    const hastaCuando = Date.now() + 90_000;
    for (;;) {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
            body: JSON.stringify({ email, password: '123456' }),
        });
        if (res.ok) return ((await res.json()) as any).tokens.accessToken as string;
        if (res.status !== 429 || Date.now() > hastaCuando) {
            throw new Error(`no se pudo entrar como ${email}: ${res.status}`);
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
}

async function tanda(token: string, ruta: string, gente: number) {
    const tiempos: number[] = [];
    let fallos = 0;
    const t0 = Date.now();

    await Promise.all(
        Array.from({ length: gente }, async () => {
            for (let i = 0; i < POR_TANDA; i++) {
                const t = Date.now();
                try {
                    const res = await fetch(`${API}${ruta}`, {
                        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
                    });
                    await res.arrayBuffer();
                    if (!res.ok) fallos++;
                    else tiempos.push(Date.now() - t);
                } catch {
                    fallos++;
                }
            }
        })
    );

    const totalMs = Date.now() - t0;
    const hechas = tiempos.length;
    return {
        gente,
        p50: percentil(tiempos, 50),
        p95: percentil(tiempos, 95),
        peor: Math.max(...tiempos, 0),
        porSegundo: totalMs > 0 ? Math.round((hechas / totalMs) * 1000) : 0,
        fallos,
    };
}

async function main() {
    const inst = await platformPrisma.institute.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!inst) {
        console.error(`No existe el liceo «${SLUG}»`);
        process.exit(1);
    }

    const db = await getTenantPrisma(inst.id);
    const anio: any = await db.academicYear.findFirst({ where: { status: 'ACTIVE' as any }, select: { id: true } });
    const seccion: any = await db.classroom.findFirst({ where: { academicYearId: anio?.id }, select: { id: true } });

    const admin = await entrar('admin@testing.edu.ve');

    const pantallas: Array<[string, string]> = [
        ['alumnos de una sección', `/students?classroomId=${seccion?.id}&page=1&limit=30`],
        ['panel del admin', '/dashboard/admin'],
        ['lista de usuarios', '/users?page=1&limit=20'],
    ];

    /**
     * ── VARIOS PROFESORES GUARDANDO A LA VEZ ────────────────────────────────
     *
     * Hasta ahora solo se había medido **abrir** pantallas con mucha gente. El
     * momento de verdad de un liceo es otro: son las 12:30, acaban seis clases
     * a la vez y seis profesores pulsan "guardar" con treinta notas dentro cada
     * uno.
     *
     * Cada profesor guarda en SU actividad, así que no chocan entre ellos: se
     * mide el sistema, no la cola de una misma fila.
     */
    const profesoresALaVez = async (cuantos: number) => {
        const asignaciones: any[] = await db.classroomSubject.findMany({
            where: { classroom: { academicYearId: anio?.id }, teacherId: { not: null } },
            select: { classroomId: true, subjectId: true, teacher: { select: { email: true } } },
            take: cuantos,
        });
        if (asignaciones.length === 0) return null;

        const lapso: any = await db.period.findFirst({ where: { academicYearId: anio?.id }, select: { id: true } });

        const preparados = [];
        for (const a of asignaciones) {
            const actividad: any = await db.activity.findFirst({
                where: { classroomId: a.classroomId, subjectId: a.subjectId },
                select: { id: true },
            });
            const suyos = await db.studentClassroom.findMany({
                where: { classroomId: a.classroomId, isActive: true },
                select: { studentId: true },
                take: 30,
            });
            if (!actividad || suyos.length === 0) continue;

            // Cada profesor empieza con su actividad limpia.
            await db.grade.deleteMany({
                where: { activityId: actividad.id, studentId: { in: suyos.map((x) => x.studentId) } },
            });

            preparados.push({
                token: await entrar(a.teacher.email),
                cuerpo: {
                    grades: suyos.map((x) => ({
                        studentId: x.studentId,
                        activityId: actividad.id,
                        subjectId: a.subjectId,
                        periodId: lapso?.id,
                        score: 15,
                    })),
                },
                limpieza: { activityId: actividad.id, studentId: { in: suyos.map((x) => x.studentId) } },
            });
        }
        if (preparados.length === 0) return null;

        const t0 = Date.now();
        const tiempos = await Promise.all(
            preparados.map(async (p) => {
                const t = Date.now();
                const res = await fetch(`${API}/grades/bulk`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${p.token}`,
                        'X-Institute-Slug': SLUG,
                    },
                    body: JSON.stringify(p.cuerpo),
                });
                await res.text();
                return res.ok ? Date.now() - t : -1;
            })
        );
        const total = Date.now() - t0;

        for (const p of preparados) await db.grade.deleteMany({ where: p.limpieza });

        const buenos = tiempos.filter((x) => x >= 0);
        return {
            profesores: preparados.length,
            p50: percentil(buenos, 50),
            peor: Math.max(...buenos, 0),
            total,
            fallos: tiempos.length - buenos.length,
        };
    };

    console.log('');
    console.log('  Varios profesores guardando notas a la vez');
    console.log('');
    console.log('    profesores' + 'p50'.padStart(9) + 'peor'.padStart(9) + 'todo'.padStart(9));
    console.log('    ' + '─'.repeat(38));
    for (const cuantos of [1, 3, 6, 12]) {
        const r = await profesoresALaVez(cuantos);
        if (!r) { console.log(`    ${String(cuantos).padStart(10)}  (faltan datos)`); continue; }
        console.log(
            '    ' + String(r.profesores).padStart(10) +
            `${r.p50}`.padStart(7) + 'ms' +
            `${r.peor}`.padStart(7) + 'ms' +
            `${r.total}`.padStart(7) + 'ms' +
            (r.fallos ? `   FALLOS: ${r.fallos}` : '')
        );
        await new Promise((r) => setTimeout(r, 500));
    }

    for (const [nombre, ruta] of pantallas) {
        console.log(`\n  ${nombre}   (${POR_TANDA} llamadas por persona)\n`);
        console.log('    a la vez' + 'p50'.padStart(9) + 'p95'.padStart(9) + 'peor'.padStart(9) + 'por seg'.padStart(10));
        console.log('    ' + '─'.repeat(46));

        for (const gente of A_LA_VEZ) {
            const r = await tanda(admin, ruta, gente);
            console.log(
                '    ' + String(r.gente).padStart(8) +
                `${r.p50}`.padStart(7) + 'ms' +
                `${r.p95}`.padStart(7) + 'ms' +
                `${r.peor}`.padStart(7) + 'ms' +
                String(r.porSegundo).padStart(10) +
                (r.fallos ? `   FALLOS: ${r.fallos}` : '')
            );
            // Un respiro para que los contadores por minuto no confundan la
            // medida siguiente.
            await new Promise((r) => setTimeout(r, 400));
        }
    }

    console.log('');
    await platformPrisma.$disconnect();
    process.exit(0);
}

main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
