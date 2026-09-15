/**
 * CUÁNTAS CONSULTAS CUESTA CADA PANTALLA
 *
 * El problema que más se repite en este sistema es el mismo: **preguntar lo
 * mismo una vez por alumno**. Ha aparecido cuatro veces —en el aviso de
 * cambios, en la limpieza de copias por alumno, en la limpieza por nota y en el
 * guardado de notas— y las cuatro se encontraron contando, no leyendo.
 *
 * Mirando el reloj no se ve: "361 ms" parece lentitud normal. Contando, eran
 * **300 consultas para guardar 29 notas**, que es otra cosa y tiene otro
 * arreglo.
 *
 * Esto cuenta las consultas de cada pantalla. Lo que hay que mirar no es el
 * número en sí, sino **si crece con el número de alumnos**: eso es la firma del
 * fallo.
 *
 * ─── CÓMO SE USA ─────────────────────────────────────────────────────────────
 *
 * Hace falta el servidor levantado CON el registro de consultas encendido:
 *
 *   LOG_TENANT_QUERIES=1 npm run dev
 *
 * y luego, con la ruta del registro:
 *
 *   npm run contar:consultas -- <archivo-de-registro>
 */
import { platformPrisma, getTenantPrisma } from '../config/database';
import * as fs from 'fs';

const API = process.env.API_BASE || 'http://localhost:3001/api';
const SLUG = process.env.LICEO || 'instituto-testing';
const REGISTRO = process.argv[2];

async function entrar(email: string) {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': SLUG },
        body: JSON.stringify({ email, password: '123456' }),
    });
    if (!res.ok) throw new Error(`no se pudo entrar como ${email}: ${res.status}`);
    return ((await res.json()) as any).tokens.accessToken as string;
}

const lineas = () => {
    try {
        return fs.readFileSync(REGISTRO, 'utf8').split('\n').length;
    } catch {
        return 0;
    }
};

const consultasEntre = (desde: number, hasta: number) => {
    try {
        const todas = fs.readFileSync(REGISTRO, 'utf8').split('\n').slice(desde, hasta);
        return todas.filter((l) => l.includes('prisma:query')).length;
    } catch {
        return 0;
    }
};

async function contar(token: string, ruta: string): Promise<number> {
    // Una en frío que no cuenta.
    await fetch(`${API}${ruta}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 400));

    const antes = lineas();
    const res = await fetch(`${API}${ruta}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG },
    });
    await res.text();
    await new Promise((r) => setTimeout(r, 700));

    return res.ok ? consultasEntre(antes, lineas()) : -1;
}

async function main() {
    if (!REGISTRO || !fs.existsSync(REGISTRO)) {
        console.error('\n  Falta el archivo de registro del servidor.');
        console.error('  Levántalo con:  LOG_TENANT_QUERIES=1 npm run dev  > registro.txt');
        console.error('  y luego:        npm run contar:consultas -- registro.txt\n');
        process.exit(1);
    }

    const inst = await platformPrisma.institute.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!inst) { console.error(`No existe el liceo «${SLUG}»`); process.exit(1); }

    const db = await getTenantPrisma(inst.id);
    const anio: any = await db.academicYear.findFirst({ where: { status: 'ACTIVE' as any }, select: { id: true } });
    const seccion: any = await db.classroom.findFirst({ where: { academicYearId: anio?.id }, select: { id: true } });

    const admin = await entrar('admin@testing.edu.ve');

    console.log(`\n  Consultas por pantalla · liceo ${SLUG}\n`);
    console.log('  ' + 'pantalla'.padEnd(40) + 'consultas'.padStart(11));
    console.log('  ' + '─'.repeat(52));

    const sueltas: Array<[string, string]> = [
        ['panel del admin', '/dashboard/admin'],
        ['lista de usuarios', '/users?page=1&limit=20'],
        ['medidores de la sección', `/statistics/section/${seccion?.id}`],
        ['materias del liceo', '/subjects'],
    ];

    for (const [nombre, ruta] of sueltas) {
        const n = await contar(admin, ruta);
        console.log('  ' + nombre.padEnd(40) + (n < 0 ? '(error)' : String(n)).padStart(11));
    }

    // ── Lo que de verdad importa: ¿crece con el número de alumnos? ───────────
    console.log('\n  ¿Crecen las consultas con el número de alumnos?');
    console.log('  (si crecen, hay algo preguntando una vez por alumno)\n');

    let anterior = 0;
    for (const limite of [1, 5, 10, 30]) {
        const n = await contar(admin, `/students?classroomId=${seccion?.id}&page=1&limit=${limite}`);
        const señal = anterior > 0 && n > anterior ? `  ← subió ${n - anterior}` : '';
        console.log(`    alumnos de una sección, ${String(limite).padStart(2)} alumnos:  ${String(n).padStart(4)}${señal}`);
        anterior = n;
    }
    console.log('');

    await platformPrisma.$disconnect();
    process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
