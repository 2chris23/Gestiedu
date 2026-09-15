/**
 * 15.000 PERSONAS CON LA APP ABIERTA A LA VEZ
 *
 * Esto no lo mide k6: las pruebas de carga de HTTP cuentan peticiones, y aquí el
 * riesgo es otro. Un liceo grande a las 8 de la mañana son miles de teléfonos
 * conectados **sin pedir nada**, solo esperando. Cada uno es una conexión abierta
 * en el servidor.
 *
 * Dos preguntas, y las dos hacen falta:
 *
 *   1. ¿Aguanta el servidor esa cantidad de conexiones a la vez?
 *   2. Cuando un profesor pone UNA nota, ¿a cuántos de esos miles les llega el
 *      aviso? Tiene que llegarle al alumno, a sus representantes y al personal
 *      de la sección. A los demás, a nadie. Si le llega a los 15.000, el modelo
 *      no sirve y el servidor se ahoga con cada nota.
 *
 * La segunda pregunta es la importante. La primera solo dice si se llega a
 * poder hacer la segunda.
 *
 * USO:
 *   npx tsx load-tests/sockets-15k.ts            ← 15.000
 *   npx tsx load-tests/sockets-15k.ts 5000       ← la cantidad que se diga
 *
 * Si el proceso cliente se queda sin memoria, no es el servidor: son 15.000
 * clientes dentro de un solo Node. Se levanta con
 * NODE_OPTIONS=--max-old-space-size=8192.
 */

import path from 'path';
import dotenv from 'dotenv';
import { io as conectar, Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import axios from 'axios';
import { execSync } from 'child_process';
import { createId } from '@paralleldrive/cuid2';

/**
 * Se carga la configuración EXACTAMENTE como la carga el servidor
 * (`apps/backend/src/config/environment.ts`): mismo orden, mismo `override`.
 *
 * Hace falta hacerlo así. Este proyecto tiene un `JWT_SECRET` distinto en `.env`
 * y en `.env.development`, y gana el segundo. Un script que cargue solo `.env`
 * firma con la clave equivocada y el servidor le rechaza todos los tokens sin
 * decir por qué. Y si la máquina tiene un JWT_SECRET suelto en sus variables de
 * entorno, sin `override` ese le gana a los dos.
 */
const RAIZ_BACKEND = path.join(__dirname, '..', 'apps', 'backend');
const ENTORNO = process.env.NODE_ENV || 'development';
for (const archivo of ['.env', '.env.local', `.env.${ENTORNO}`, `.env.${ENTORNO}.local`]) {
    dotenv.config({ path: path.join(RAIZ_BACKEND, archivo), override: true });
}

const CUANTOS = Number(process.argv[2]) || 15000;
/** Segundos que se mantienen abiertas las conexiones, para cargar HTTP encima. */
const MANTENER = Number(process.env.MANTENER_SEGUNDOS || 0);
const API = process.env.LOAD_API_URL || 'http://localhost:3001';
const SLUG = 'test-load-5k';

/** De cuántos en cuántos se conectan, para no abrir 15.000 sockets de golpe. */
const TANDA = 250;
const PAUSA_ENTRE_TANDAS_MS = 60;

// ─── Utilidades ──────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cuánta memoria está gastando el servidor ahora mismo. Solo Windows; si falla, se calla. */
function ramDelServidor(): string {
    try {
        const salida = execSync(
            'powershell -NoProfile -Command "$p = Get-NetTCPConnection -State Listen | ' +
                'Where-Object {$_.LocalPort -eq 3001} | Select-Object -First 1 -ExpandProperty OwningProcess; ' +
                '[int]((Get-Process -Id $p).WorkingSet64/1MB)"',
            { encoding: 'utf8', timeout: 15000 }
        ).trim();
        return `${salida} MB`;
    } catch {
        return 'no se pudo medir';
    }
}
const miles = (n: number) => n.toLocaleString('es-VE');

function firmar(usuario: { id: string; email: string; role: string }, instituteId: string): string {
    return jwt.sign(
        {
            id: usuario.id,
            userId: usuario.id,
            email: usuario.email,
            role: usuario.role,
            instituteId,
        },
        process.env.JWT_SECRET!,
        {
            expiresIn: '2h',
            algorithm: 'HS256',
            issuer: 'gestion-escolar-api',
            audience: 'gestion-escolar-client',
        }
    );
}

async function clientePlataforma(): Promise<Client> {
    const c = new Client({ connectionString: process.env.PLATFORM_DATABASE_URL });
    await c.connect();
    return c;
}

// ─── Programa ────────────────────────────────────────────────────────────────

async function principal(): Promise<void> {
    console.log(`\nProbando con ${miles(CUANTOS)} personas conectadas a la vez.\n`);

    // 1. Datos del liceo de pruebas
    const plataforma = await clientePlataforma();
    const { rows: institutos } = await plataforma.query(
        'SELECT id, "databaseName", "databaseHost", "databasePort", "databaseUser", "databasePassword" FROM institutes WHERE slug = $1',
        [SLUG]
    );
    await plataforma.end();

    if (institutos.length === 0) throw new Error(`No existe el liceo de pruebas "${SLUG}"`);
    const liceo = institutos[0];

    const tenant = new Client({
        host: liceo.databaseHost,
        port: liceo.databasePort,
        user: liceo.databaseUser,
        password: liceo.databasePassword,
        database: liceo.databaseName,
    });
    await tenant.connect();

    // 2. A quién se conecta: estudiantes primero, que son la mayoría real
    const { rows: personas } = await tenant.query(
        `SELECT id, email, role FROM users
         WHERE "isActive" = true AND role IN ('STUDENT', 'TUTOR', 'TEACHER')
         ORDER BY CASE role WHEN 'STUDENT' THEN 0 WHEN 'TUTOR' THEN 1 ELSE 2 END
         LIMIT $1`,
        [CUANTOS]
    );
    console.log(`Gente disponible en el liceo: ${miles(personas.length)}`);

    // 3. Conectar en tandas
    const sockets: Socket[] = [];
    const recibieron = new Set<string>();
    /** Cuándo llegó el primer aviso, para medir la entrega de verdad. */
    let primerAviso = 0;
    let conectados = 0;
    let fallaron = 0;
    const t0 = Date.now();

    for (let i = 0; i < personas.length; i += TANDA) {
        const tanda = personas.slice(i, i + TANDA);

        await Promise.all(
            tanda.map(
                (persona: any) =>
                    new Promise<void>((resolver) => {
                        const s = conectar(API, {
                            auth: { token: firmar(persona, liceo.id) },
                            transports: ['websocket'],
                            reconnection: false,
                            timeout: 20000,
                        });

                        s.on('connect', () => {
                            conectados++;
                            sockets.push(s);
                            resolver();
                        });
                        s.on('connect_error', (err) => {
                            fallaron++;
                            if (fallaron <= 2) console.log(`  motivo del fallo: ${err?.message}`);
                            resolver();
                        });

                        s.on('datos:cambiaron', () => {
                            if (primerAviso === 0) primerAviso = Date.now();
                            recibieron.add(persona.id);
                        });
                    })
            )
        );

        if ((i / TANDA) % 8 === 0 || i + TANDA >= personas.length) {
            const mem = process.memoryUsage().rss / 1024 / 1024;
            console.log(
                `  ${miles(conectados).padStart(6)} conectados` +
                    (fallaron ? ` · ${miles(fallaron)} fallaron` : '') +
                    ` · ${((Date.now() - t0) / 1000).toFixed(1)}s · cliente ${mem.toFixed(0)} MB`
            );
        }

        await esperar(PAUSA_ENTRE_TANDAS_MS);
    }

    console.log(
        `\nCONECTADOS: ${miles(conectados)} de ${miles(personas.length)}` +
            (fallaron ? ` · ${miles(fallaron)} fallaron` : ' · ninguno falló') +
            ` · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`
    );

    console.log(`Memoria del servidor con ${miles(conectados)} conectados: ${ramDelServidor()}
`);

    if (conectados === 0) {
        await tenant.end();
        throw new Error('No se conectó nadie: no tiene sentido seguir.');
    }

    // 4. Ahora la pregunta que importa: un profesor pone UNA nota.
    //    ¿A cuántos de los conectados les llega el aviso?
    // Un alumno que esté conectado, con su sección y una materia de esa sección
    const idsConectados = personas.slice(0, conectados).map((p: any) => p.id);
    const { rows: candidatos } = await tenant.query(
        `SELECT sc."studentId", sc."classroomId", cs."subjectId", cs."teacherId"
         FROM student_classrooms sc
         JOIN classroom_subjects cs ON cs."classroomId" = sc."classroomId"
         WHERE sc."isActive" = true AND sc."studentId" = ANY($1::text[])
         LIMIT 1`,
        [idsConectados]
    );

    if (candidatos.length === 0) {
        console.log('No hay ningún alumno conectado con sección y materia: no se puede medir el aviso.');
        await tenant.end();
        sockets.forEach((s) => s.disconnect());
        return;
    }

    const { studentId, classroomId, subjectId, teacherId } = candidatos[0];

    // La nota la pone el profesor de esa materia, no un admin: el sistema exige
    // que quien califica sea profesor, y así además la prueba es la de verdad.
    const { rows: profesores } = await tenant.query(
        `SELECT id, email, role FROM users WHERE id = $1`,
        [teacherId]
    );
    if (profesores.length === 0) {
        console.log('La materia no tiene profesor asignado: no se puede medir.');
        await tenant.end();
        sockets.forEach((s) => s.disconnect());
        return;
    }
    const tokenProfesor = firmar(profesores[0], liceo.id);

    // Una actividad nueva, para que la nota no choque con una que ya exista
    const { rows: periodos } = await tenant.query(
        `SELECT id FROM periods WHERE "isActive" = true ORDER BY "startDate" DESC LIMIT 1`
    );
    const periodId = periodos[0]?.id;

    // El id tiene que ser un cuid: la ruta lo valida y un UUID se rechaza con 400.
    const nuevoId = () => {
        const id = createId();
        return id.startsWith('c') ? id : `c${id}`;
    };
    const activityId = nuevoId();

    await tenant.query(
        `INSERT INTO activities (id, title, type, scope, "startDate", "maxGrade", weight,
                                 "classroomId", "subjectId", "periodId", lapso, "createdBy",
                                 "createdAt", "updatedAt")
         VALUES ($1, $2, 'SUMATIVA', 'CLASSROOM', now(), 20, 1,
                 $3, $4, $5, '1', $6, now(), now())`,
        [activityId, `Prueba de carga ${Date.now()}`, classroomId, subjectId, periodId, teacherId]
    );

    console.log('Un profesor pone UNA nota. Viendo a cuántos les llega...\n');
    recibieron.clear();
    primerAviso = 0;
    const tNota = Date.now();

    try {
        await axios.post(
            `${API}/api/grades`,
            { score: 18, studentId, activityId, periodId, subjectId },
            {
                headers: {
                    Authorization: `Bearer ${tokenProfesor}`,
                    'X-Institute-Slug': SLUG,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );
    } catch (error: any) {
        console.log('  La nota no se pudo poner:', error?.response?.status, JSON.stringify(error?.response?.data));
        await tenant.query(`DELETE FROM activities WHERE id = $1`, [activityId]);
        await tenant.end();
        sockets.forEach((s) => s.disconnect());
        throw new Error('Sin la nota no se puede medir el aviso.');
    }

    // Tiempo de sobra para que llegue a todo el que tenga que llegar
    await esperar(6000);
    const alAlumno = recibieron.has(studentId);

    console.log('  ───────────────────────────────────────────');
    console.log(`  Conectados            ${miles(conectados)}`);
    console.log(`  Recibieron el aviso   ${miles(recibieron.size)}`);
    console.log(`  ¿Le llegó al alumno?  ${alAlumno ? 'sí' : 'NO'}`);
    console.log(`  Tardó en llegar       ${primerAviso ? `${primerAviso - tNota} ms` : 'no llegó'}`);
    console.log('  ───────────────────────────────────────────\n');

    if (recibieron.size > conectados * 0.1 && conectados > 100) {
        console.log('  AVISO: el cambio llegó a demasiada gente. El aviso dirigido no está funcionando.');
    }

    // 5. Limpiar lo que se creó para medir
    await tenant.query(`DELETE FROM grades WHERE "activityId" = $1`, [activityId]);
    await tenant.query(`DELETE FROM activities WHERE id = $1`, [activityId]);
    await tenant.end();

    if (MANTENER > 0) {
        console.log(`Manteniendo ${miles(conectados)} conexiones abiertas ${MANTENER}s ` +
            `(para cargar HTTP encima)...`);
        const hasta = Date.now() + MANTENER * 1000;
        while (Date.now() < hasta) {
            await esperar(15000);
            const vivos = sockets.filter((s) => s.connected).length;
            console.log(`  quedan ${miles(vivos)} conectados · servidor ${ramDelServidor()}`);
        }
        const sobrevivieron = sockets.filter((s) => s.connected).length;
        console.log(`
SOBREVIVIERON ${miles(sobrevivieron)} de ${miles(conectados)} tras ${MANTENER}s
`);
    }

    sockets.forEach((s) => s.disconnect());
    console.log('Listo.');
}

principal()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\nFALLÓ:', error instanceof Error ? error.message : error);
        process.exit(1);
    });
