/**
 * LA MISMA CIFRA EN TODAS PARTES (puerta 1, CLAUDE.md 0-bis y 0-ter)
 *
 *   npx tsx src/scripts/barrido-de-cifras.ts                 # instituto-testing, 60 alumnos
 *   LICEO=otro ALUMNOS=200 npx tsx src/scripts/barrido-de-cifras.ts
 *   npx tsx src/scripts/barrido-de-cifras.ts --exigir        # sale 1 si algo no cuadra
 *
 * La pregunta de Cristian: «nada de que un usuario tenga un promedio y en otra
 * parte otro». Arranca el servidor tal cual se sirve (sin abrir puerto) y, para
 * cada alumno de la muestra, pide como lo pediría cada pantalla —el admin, el
 * propio alumno y su representante— el promedio general, el de cada materia y
 * la asistencia, y los compara con la BOLETA, que es la cifra oficial (MAPA §6).
 *
 * Qué compara (a una décima, que es como se enseña):
 *   · promedio general: boleta · ficha del admin · Inicio del alumno ·
 *     Inicio del representante · lista de alumnos · cuadro de honor (ciclo);
 *   · cada materia: la definitiva de la boleta · la ficha · el Inicio del alumno;
 *   · la sección: su mínimo y su máximo frente a los de sus alumnos;
 *   · cada materia en su sección: el catálogo · la lista · la tarjeta de la sección;
 *   · el cuadro general del guía: el promedio y cada materia de cada alumno;
 *   · el resumen final del MPPE y el cierre del año: la definitiva de cada materia.
 *   · asistencia del ciclo: la ficha · la lista · el Inicio del alumno (ciclo).
 *
 * Qué NO mide: que la cifra de la boleta sea la correcta (eso lo dicen las
 * pruebas de cálculo, `MAPA_DE_CALCULOS.md`); solo que todas digan lo mismo.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { generateAccessToken } from '../config/jwt';

const SLUG = process.env.LICEO || 'instituto-testing';
const ALUMNOS = Number(process.env.ALUMNOS || 60);
const EXIGIR = process.argv.includes('--exigir');

type Num = number | null | undefined;
const d1 = (x: Num) => (x === null || x === undefined || Number.isNaN(Number(x)) ? null : Math.round(Number(x) * 10) / 10);

interface Diferencia { alumno: string; que: string; valores: Record<string, Num> }

async function main() {
    const inst = await platformPrisma.institute.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!inst) throw new Error(`No existe el liceo «${SLUG}»`);
    const db: any = await getTenantPrisma(inst.id);
    const { buildServer } = await import('../server');
    const server = await buildServer();
    await server.ready();

    const llave = (u: { id: string; email: string; role: string }) =>
        generateAccessToken({ id: u.id, userId: u.id, email: u.email, role: u.role as any, instituteId: inst.id });
    const pedir = async (u: { id: string; email: string; role: string }, url: string) => {
        const r = await server.inject({ method: 'GET', url: `/api${url}`, headers: { authorization: `Bearer ${llave(u)}`, 'x-institute-slug': SLUG } });
        if (r.statusCode >= 400) return { __error: r.statusCode };
        return r.json();
    };

    const admin = await db.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
    const anio = await db.academicYear.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
    // La muestra: repartida por todas las secciones del año activo.
    const inscritos = await db.studentClassroom.findMany({
        where: { isActive: true, academicYearId: anio.id },
        select: { studentId: true, classroomId: true, student: { select: { id: true, email: true, role: true, firstName: true, lastName: true } } },
        orderBy: { studentId: 'asc' },
    });
    const paso = Math.max(1, Math.floor(inscritos.length / ALUMNOS));
    const repartida = inscritos.filter((_: unknown, i: number) => i % paso === 0).slice(0, ALUMNOS);
    // Y alumnos con representante, para mirar también su Inicio.
    const conTutor = new Set(
        (await db.studentTutor.findMany({ where: { studentId: { in: inscritos.map((x: any) => x.studentId) } }, select: { studentId: true }, take: 20 })).map((x: any) => x.studentId)
    );
    const muestra = [...repartida, ...inscritos.filter((x: any) => conTutor.has(x.studentId) && !repartida.includes(x))];

    const difs: Diferencia[] = [];
    // Cuántas cifras dio cada fuente: un barrido que no compara nada sale en verde y no vale.
    const vistas = new Map<string, number>();
    const anotar = (alumno: string, que: string, valores: Record<string, Num>) => {
        for (const [k, v] of Object.entries(valores)) {
            if (v !== null && v !== undefined) vistas.set(`${que.startsWith('materia') ? 'materia' : que} · ${k}`, (vistas.get(`${que.startsWith('materia') ? 'materia' : que} · ${k}`) ?? 0) + 1);
        }
        const vistos = Object.values(valores).filter((v) => v !== null && v !== undefined).map(d1);
        if (new Set(vistos).size > 1) difs.push({ alumno, que, valores });
    };

    const listas = new Map<string, any[]>();
    const listaDe = async (classroomId: string) => {
        if (!listas.has(classroomId)) {
            const r = await pedir(admin, `/students?classroomId=${classroomId}&page=1&limit=100`);
            listas.set(classroomId, r.students ?? []);
        }
        return listas.get(classroomId)!;
    };
    const promediosDeLaSeccion = new Map<string, number[]>();

    let n = 0;
    for (const ins of muestra) {
        const yo = ins.student;
        const nombre = `${yo.firstName} ${yo.lastName} (${yo.email})`;
        const tutorRel = await db.studentTutor.findFirst({ where: { studentId: yo.id }, select: { tutor: { select: { id: true, email: true, role: true } } } }).catch(() => null);

        const [boleta, ficha, inicio, tutorIni, honor, lista] = await Promise.all([
            pedir(admin, `/students/${yo.id}/boleta`),
            pedir(admin, `/students/${yo.id}/dashboard`),
            pedir(yo, '/students/my-dashboard'),
            tutorRel?.tutor ? pedir(tutorRel.tutor, '/dashboard/tutor') : Promise.resolve(null),
            pedir(admin, `/cuadro-de-honor/alumno/${yo.id}`),
            listaDe(ins.classroomId),
        ]);
        const b = boleta?.data ?? boleta;
        const i = inicio?.data ?? inicio;
        const t = (tutorIni?.data ?? tutorIni)?.children?.find((c: any) => c.id === yo.id);
        const enLista = lista.find((s: any) => s.id === yo.id);
        const honorCiclo = (honor?.alcances ?? []).find((a: any) => a.alcance === 'CICLO' || /ciclo|año/i.test(a.nombre ?? ''));

        anotar(nombre, 'promedio general', {
            boleta: b?.promedios?.definitivo,
            fichaDelAdmin: ficha?.kpis?.globalAverage,
            inicioDelAlumno: i?.kpis?.globalAverage,
            inicioDelRepresentante: t?.hasGrades ? t.average : null,
            listaDeAlumnos: enLista?.hasGrades ? enLista.average : null,
            cuadroDeHonor: honorCiclo?.desglose?.promedio,
        });
        if (b?.promedios?.definitivo != null) {
            if (!promediosDeLaSeccion.has(ins.classroomId)) promediosDeLaSeccion.set(ins.classroomId, []);
            promediosDeLaSeccion.get(ins.classroomId)!.push(b.promedios.definitivo);
        }

        for (const m of b?.materias ?? []) {
            if (m.cualitativa) continue;
            anotar(nombre, `materia ${m.nombre}`, {
                boleta: m.revision ?? m.definitiva,
                fichaDelAdmin: ficha?.subjects?.find((s: any) => s.id === m.id && s.hasGrades)?.average,
                inicioDelAlumno: i?.subjects?.find((s: any) => s.id === m.id && s.hasGrades)?.average,
            });
        }

        anotar(nombre, 'asistencia del ciclo', {
            fichaDelAdmin: ficha?.kpis?.attendancePercentage,
            listaDeAlumnos: enLista?.attendancePercentage,
            inicioDelAlumnoCiclo: i?.kpis?.attendancePercentageCiclo,
        });
        n++;
        if (n % 10 === 0) process.stdout.write(`  ${n}/${muestra.length}\n`);
    }

    // La sección: su mínimo y su máximo tienen que ser los de sus alumnos.
    // Solo se compara si la muestra trae a TODA la sección.
    for (const [classroomId] of promediosDeLaSeccion) {
        const lista = await listaDe(classroomId);
        const todos = await Promise.all(
            lista.map(async (s: any) => (await pedir(admin, `/students/${s.id}/boleta`))?.data?.promedios?.definitivo as Num)
        );
        const con = todos.filter((x): x is number => typeof x === 'number');
        if (con.length === 0) continue;
        const st = await pedir(admin, `/classrooms/${classroomId}/stats`);
        // El cuadro general del guía: cada alumno, su promedio y cada materia, frente a su boleta.
        const cuadro = await pedir(admin, `/classrooms/${classroomId}/cuadro-general`);
        const filas = (cuadro?.data ?? cuadro)?.students ?? [];
        // Y el resumen final del MPPE (el papel del fin de año).
        const resumen = await pedir(admin, `/classrooms/${classroomId}/resumen-final?tipo=FINAL`);
        const deResumen = (resumen?.data ?? resumen)?.alumnos ?? [];
        for (const s of lista) {
            const b = (await pedir(admin, `/students/${s.id}/boleta`))?.data;
            const f = filas.find((x: any) => x.id === s.id);
            if (!b || !f) continue;
            anotar(`${s.firstName} ${s.lastName} (cuadro)`, 'promedio general', { boleta: b.promedios?.definitivo, cuadroGeneral: f.generalAverage });
            for (const m of b.materias ?? []) {
                if (m.cualitativa) continue;
                anotar(`${s.firstName} ${s.lastName} (cuadro)`, `materia ${m.nombre}`, { boleta: m.revision ?? m.definitiva, cuadroGeneral: f.grades?.[m.id]?.promedio });
                const r = deResumen.find((x: any) => x.cedula === s.id)?.notas?.[m.id];
                if (r) anotar(`${s.firstName} ${s.lastName} (resumen final)`, `materia ${m.nombre}`, { boleta: m.definitiva, resumenFinal: r.definitiva });
            }
        }
        anotar(`sección ${classroomId}`, 'mínimo de la sección', { boletas: Math.min(...con), resumenDeLaSeccion: st?.minAverage });
        anotar(`sección ${classroomId}`, 'máximo de la sección', { boletas: Math.max(...con), resumenDeLaSeccion: st?.maxAverage });
        anotar(`sección ${classroomId}`, 'promedio de la sección', { mediaDeLasBoletas: con.reduce((a, x) => a + x, 0) / con.length, resumenDeLaSeccion: st?.average });
    }

    // El cierre del año: la definitiva con la que se promueve, frente a la boleta.
    const cierre = await server.inject({
        method: 'POST',
        url: `/api/academic-years/${anio.id}/close/prepare`,
        headers: { authorization: `Bearer ${llave(admin)}`, 'x-institute-slug': SLUG },
    });
    const sugerencias = cierre.statusCode < 400 ? (cierre.json()?.suggestions ?? cierre.json()?.data?.suggestions ?? []) : [];
    for (const ins of muestra) {
        const sg = sugerencias.find((x: any) => x.studentId === ins.studentId);
        if (!sg) continue;
        const b = (await pedir(admin, `/students/${ins.studentId}/boleta`))?.data;
        for (const m of b?.materias ?? []) {
            if (m.cualitativa) continue;
            const enCierre = sg.subjectGrades?.find((g: any) => g.subjectId === m.id);
            if (enCierre?.conNotas === false) continue;
            anotar(`${ins.student.firstName} ${ins.student.lastName} (cierre)`, `materia ${m.nombre}`, { boleta: m.revision ?? m.definitiva, cierreDelAno: enCierre?.average });
        }
    }

    // ─── Lo de arriba: el año, el liceo y cada materia ───────────────────────
    // La sección es la media de sus alumnos; el año, la de sus secciones; el
    // liceo, la de sus años (MAPA §6). Cada pantalla tiene que cuadrar con eso.
    const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const secciones = await db.classroom.findMany({ where: { academicYearId: anio.id }, select: { id: true, grade: true } });
    const resumenDe = new Map<string, any>();
    await Promise.all(secciones.map(async (s: any) => resumenDe.set(s.id, await pedir(admin, `/classrooms/${s.id}/stats`))));
    const delAno = await pedir(admin, `/academic-years/${anio.id}/stats`);
    const porGrado = new Map<number, number>();
    for (const g of Array.isArray(delAno) ? delAno : []) {
        const deSusSecciones = secciones.filter((s: any) => s.grade === g.grade).map((s: any) => resumenDe.get(s.id)?.average).filter((x: any) => typeof x === 'number');
        anotar(`${g.grade}.º año`, 'promedio del año', { pantallaDelAno: g.stats?.average, mediaDeSusSecciones: media(deSusSecciones) });
        const alumnosDelGrado = secciones.filter((s: any) => s.grade === g.grade);
        const maxs = alumnosDelGrado.map((s: any) => resumenDe.get(s.id)?.maxAverage).filter((x: any) => typeof x === 'number');
        const mins = alumnosDelGrado.map((s: any) => resumenDe.get(s.id)?.minAverage).filter((x: any) => typeof x === 'number');
        if (maxs.length) anotar(`${g.grade}.º año`, 'máximo del año', { pantallaDelAno: g.stats?.maxAverage, elMejorDeSusSecciones: Math.max(...maxs) });
        if (mins.length) anotar(`${g.grade}.º año`, 'mínimo del año', { pantallaDelAno: g.stats?.minAverage, elPeorDeSusSecciones: Math.min(...mins) });
        const riesgo = alumnosDelGrado.map((s: any) => resumenDe.get(s.id)?.riskCount ?? 0).reduce((a: number, b: number) => a + b, 0);
        anotar(`${g.grade}.º año`, 'en riesgo del año', { pantallaDelAno: g.stats?.riskCount, sumaDeSusSecciones: riesgo });
        if (typeof g.stats?.average === 'number') porGrado.set(g.grade, g.stats.average);
    }
    const panel = await pedir(admin, '/dashboard/admin');
    const p = panel?.data ?? panel;
    anotar('el liceo', 'promedio del liceo', { inicioDelAdmin: p?.stats?.promedioGeneral, mediaDeLosAnos: media([...porGrado.values()]) });
    anotar('el liceo', 'en riesgo en el liceo', {
        inicioDelAdmin: p?.stats?.studentsAtRisk,
        sumaDeLosAnos: (Array.isArray(delAno) ? delAno : []).reduce((a: number, g: any) => a + (g.stats?.riskCount ?? 0), 0),
    });

    // Cada profesor: su Inicio frente a su fila en Profesores.
    const lista = await pedir(admin, '/profesores');
    for (const pr of ((lista?.data ?? lista)?.profesores ?? []).slice(0, 8)) {
        const u = await db.user.findUnique({ where: { id: pr.id }, select: { id: true, email: true, role: true } });
        if (!u) continue;
        const ini = await pedir(u, '/dashboard/teacher');
        anotar(`profesor ${pr.nombre}`, 'promedio del profesor', { inicioDelProfesor: (ini?.data ?? ini)?.stats?.promedioGeneral, filaEnProfesores: pr.promedio });
    }

    // Cada materia: su pantalla del catálogo frente a la lista de alumnos de esa materia.
    const tarjetas = new Map<string, any[]>();
    const materias = await db.subject.findMany({ where: { evaluacion: { not: 'CUALITATIVA' } }, select: { id: true, slug: true, name: true }, take: 6 });
    for (const m of materias) {
        const r = await pedir(admin, `/subjects/${m.slug ?? m.id}`);
        const sec = (r?.data ?? r)?.sections ?? [];
        for (const s of sec.slice(0, 6)) {
            const lista = await pedir(admin, `/students?classroomId=${s.id}&subjectId=${m.id}&page=1&limit=100`);
            const notas = (lista.students ?? []).filter((x: any) => x.hasGrades).map((x: any) => x.average);
            // Y la tarjeta de la materia en la pestaña Materias de la sección.
            if (!tarjetas.has(s.id)) tarjetas.set(s.id, (await pedir(admin, `/classrooms/${s.id}/subjects?stats=true`))?.subjects ?? []);
            const tarjeta = tarjetas.get(s.id)!.find((t: any) => t.id === m.id);
            anotar(`${m.name} en ${s.name}`, 'promedio de la materia en la sección', {
                pantallaDeLaMateria: s.average || null,
                mediaDeLaLista: media(notas),
                tarjetaEnLaSeccion: tarjeta?.stats?.average ?? null,
            });
        }
    }

    const porQue = new Map<string, number>();
    for (const d of difs) {
        const clave = `${d.que.startsWith('materia') ? 'materia' : d.que} · ${Object.keys(d.valores).filter((k) => d.valores[k] != null).join(' / ')}`;
        porQue.set(clave, (porQue.get(clave) ?? 0) + 1);
    }
    console.log(`\n  Liceo ${SLUG}: ${n} alumnos, ${promediosDeLaSeccion.size} secciones. Diferencias: ${difs.length}\n`);
    for (const [k, v] of [...porQue.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
    console.log('\n  Cifras comparadas por fuente:');
    for (const [k, v] of [...vistas.entries()].sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);
    console.log('\n  Ejemplos:');
    const ejemplos = new Set<string>();
    for (const d of difs) {
        const tipo = d.que.startsWith('materia') ? 'materia' : d.que;
        if (ejemplos.has(tipo)) continue;
        ejemplos.add(tipo);
        console.log(`  · ${d.alumno} — ${d.que}: ${JSON.stringify(d.valores)}`);
    }
    await server.close();
    await platformPrisma.$disconnect();
    if (EXIGIR && difs.length > 0) process.exit(1);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
