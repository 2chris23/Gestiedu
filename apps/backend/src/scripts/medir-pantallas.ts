/**
 * CUÁNTO TARDA CADA PANTALLA, MEDIDO CONTRA EL SERVIDOR DE VERDAD
 *
 * Las corridas con k6 no servían: el generador de carga corre en la misma
 * máquina que la API y que PostgreSQL, así que todo salía a 12 segundos y lo
 * que se medía era el PC.
 *
 * Aquí el generador es un script de Node que casi no gasta: lo que se mide es
 * el servidor. No es una prueba de carga —para eso hace falta otra máquina—,
 * es la respuesta a "¿cuánto tarda cada pantalla?", que es lo que nota quien
 * usa el sistema.
 */
import { platformPrisma } from '../config/database';
import { guardarMedicion } from './guardar-medicion';

const API = process.env.API_BASE || 'http://localhost:3001/api';
const SLUG = process.env.LICEO || 'instituto-testing';
const VECES = Number(process.env.VECES || 12);

interface Medida {
    pantalla: string;
    quien: string;
    p50: number;
    p95: number;
    peor: number;
    fallos: number;
    bytes: number;
}

const percentil = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const o = [...xs].sort((a, b) => a - b);
    return o[Math.min(o.length - 1, Math.floor((o.length * p) / 100))];
};

async function entrar(email: string, password: string) {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`no se pudo entrar como ${email}: ${res.status}`);
    const datos: any = await res.json();
    return { token: datos.tokens.accessToken as string, user: datos.user };
}

async function medir(pantalla: string, quien: string, token: string, ruta: string): Promise<Medida> {
    const tiempos: number[] = [];
    let fallos = 0;
    let bytes = 0;

    // Una en frío que no cuenta: la primera paga el arranque de las consultas.
    await fetch(`${API}${ruta}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
    }).catch(() => undefined);

    for (let i = 0; i < VECES; i++) {
        const t = Date.now();
        try {
            const res = await fetch(`${API}${ruta}`, {
                headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
            });
            const cuerpo = await res.text();
            if (!res.ok) fallos++;
            else {
                tiempos.push(Date.now() - t);
                bytes = Math.max(bytes, cuerpo.length);
            }
        } catch {
            fallos++;
        }
    }

    return {
        pantalla,
        quien,
        p50: percentil(tiempos, 50),
        p95: percentil(tiempos, 95),
        peor: Math.max(...tiempos, 0),
        fallos,
        bytes,
    };
}

async function main() {
    const inst = await platformPrisma.institute.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!inst) {
        console.error(`No existe el liceo «${SLUG}»`);
        process.exit(1);
    }

    const admin = await entrar('admin@testing.edu.ve', '123456');

    // Datos reales para armar las rutas que llevan identificadores.
    const { getTenantPrisma } = await import('../config/database');
    const db = await getTenantPrisma(inst.id);

    const anio: any = await db.academicYear.findFirst({ where: { status: 'ACTIVE' as any }, select: { id: true } });
    const seccion: any = await db.classroom.findFirst({
        where: { academicYearId: anio?.id },
        select: { id: true, grade: true },
    });
    /**
     * El profesor tiene que ser **el de esa materia en esa sección**.
     *
     * Antes se cogía uno fijo, y con la mitad de las pantallas salía 403: el
     * sistema haciendo bien su trabajo, pero en la tabla aparecía como
     * "FALLOS: 12", que parece un fallo del sistema y no lo es. Una medición
     * que se lee mal es peor que no tenerla.
     */
    const materia: any = await db.classroomSubject.findFirst({
        where: { classroomId: seccion?.id, teacherId: { not: null } },
        select: { subjectId: true, teacher: { select: { email: true } } },
    });
    const alumno: any = await db.user.findFirst({ where: { role: 'STUDENT' as any }, select: { id: true } });

    const profe = await entrar(materia?.teacher?.email ?? 'profesor3@testing.edu.ve', '123456');

    const pruebas: Array<[string, { token: string }, string]> = [
        ['panel del admin', admin, '/dashboard/admin'],
        ['panel del profesor', profe, '/dashboard/teacher'],
        ['lista de usuarios (pág. 1)', admin, '/users?page=1&limit=20'],
        ['lista de usuarios (pág. 5)', admin, '/users?page=5&limit=20'],
        ['buscar usuario por texto', admin, '/users?search=ana&page=1&limit=20'],
        ['alumnos de una sección', admin, `/students?classroomId=${seccion?.id}&page=1&limit=30`],
        ['resumen de la sección', admin, `/classrooms/${seccion?.id}/stats`],
        ['medidores de la sección', admin, `/statistics/section/${seccion?.id}`],
        ['materias del profesor', profe, '/teachers/my-subjects'],
        ['secciones del profesor', profe, '/teachers/my-classrooms'],
        ['ficha de un alumno', admin, `/students/${alumno?.id}`],
        ['materias del liceo', admin, '/subjects'],
        ['secciones del ciclo', admin, `/classrooms?academicYearId=${anio?.id}`],
        ['plan de evaluación', profe, `/evaluation-plan/rows?classroomId=${seccion?.id}&subjectId=${materia?.subjectId}&lapso=1`],
        ['notas de una materia', profe, `/grades?classroomId=${seccion?.id}&subjectId=${materia?.subjectId}`],
        ['estadísticas del grado', admin, `/statistics/grade/${anio?.id}/${seccion?.grade}`],
        ['estadísticas del ciclo', admin, `/statistics/cycle/${anio?.id}`],
    ];

    console.log(`\n  Liceo: ${SLUG} · ${VECES} llamadas por pantalla · sin carga en paralelo\n`);
    console.log('  ' + 'pantalla'.padEnd(32) + 'p50'.padStart(7) + 'p95'.padStart(8) + 'peor'.padStart(8) + 'tamaño'.padStart(10));
    console.log('  ' + '─'.repeat(65));

    const medidas: Medida[] = [];
    for (const [nombre, sesion, ruta] of pruebas) {
        if (ruta.includes('undefined')) {
            console.log('  ' + nombre.padEnd(32) + '  (faltan datos para armar la ruta)');
            continue;
        }
        const m = await medir(nombre, '', sesion.token, ruta);
        medidas.push(m);
        const kb = m.bytes > 0 ? `${(m.bytes / 1024).toFixed(0)} KB` : '—';
        console.log(
            '  ' + nombre.padEnd(32) +
            `${m.p50}`.padStart(6) + 'ms' +
            `${m.p95}`.padStart(6) + 'ms' +
            `${m.peor}`.padStart(6) + 'ms' +
            kb.padStart(10) +
            (m.fallos ? `   FALLOS: ${m.fallos}` : '')
        );
    }

    const lentas = medidas.filter((m) => m.p95 > 300).sort((a, b) => b.p95 - a.p95);
    console.log('');
    if (lentas.length === 0) {
        console.log('  Ninguna pantalla pasa de 300 ms en el p95.\n');
    } else {
        console.log('  Las que pasan de 300 ms (p95):');
        for (const m of lentas) console.log(`    ${m.p95} ms  ${m.pantalla}`);
        console.log('');
    }

    guardarMedicion('pantallas', { liceo: SLUG, veces: VECES, medidas, lentasDeMasDe300ms: lentas.map((m) => m.pantalla) });
    await platformPrisma.$disconnect();
    process.exit(0);
}

main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
