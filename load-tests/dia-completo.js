/**
 * UN DÍA COMPLETO DEL LICEO — TODO EL SISTEMA A LA VEZ
 *
 * Las otras pruebas de carga miran una cosa cada una. Esta hace lo que pidió el
 * dueño: **todo el sistema funcionando al mismo tiempo**, con los tres roles
 * haciendo lo que hacen de verdad.
 *
 *   - **Alumnos**: pasando de pantalla en pantalla. Solo miran.
 *   - **Profesores**: pasando de pantalla en pantalla, y además creando y
 *     editando — pasan lista, dejan observaciones, tocan el plan de evaluación.
 *   - **Administradores**: todo lo demás. Crean alumnos, los meten en secciones,
 *     los archivan, los sacan; crean, editan y borran materias; editan el plan.
 *
 * ─── POR QUÉ NO SON NAVEGADORES DE VERDAD ────────────────────────────────────
 *
 * Cada navegador ocupa más de 100 MB. Mil alumnos serían más de 100 GB, y no hay
 * equipo que lo aguante — se caería la máquina, no el sistema, y la cifra no
 * diría nada.
 *
 * Lo que se hace aquí es mandar **exactamente las mismas peticiones que manda el
 * navegador**, sin pintar la pantalla. Lo que se mide es el servidor, que es
 * donde está el límite: pintar lo hace el teléfono de cada quien, y eso ya está
 * medido aparte en `tests/e2e/inventario-de-pantallas.spec.ts`.
 *
 * ─── CUIDADO: ESTA PRUEBA ESCRIBE DE VERDAD ──────────────────────────────────
 *
 * Crea alumnos, materias y observaciones. Corre SOLO contra el liceo de pruebas
 * de carga (`test-load-5k`), que es desechable. **Nunca contra un liceo real.**
 * Lo que crea, lo borra; lo que no se puede borrar queda anotado al final.
 *
 * EJECUTAR:
 *   API_URL=http://localhost:3002 k6 run load-tests/dia-completo.js
 *
 * Para subir o bajar la escala:
 *   ALUMNOS=500 PROFESORES=50 ADMINS=5 k6 run load-tests/dia-completo.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders } from './config.js';

// ─── Lo que se mide ───────────────────────────────────────────────────────────
const verPantalla = new Trend('ver_pantalla_ms', true);
const guardar = new Trend('guardar_ms', true);

const guardadosHechos = new Counter('guardados_hechos');
const guardadosFallidos = new Counter('guardados_fallidos');
const sinConexion = new Counter('sin_conexion_a_la_base');
const servidorOcupado = new Counter('servidor_ocupado_503');
const otrosErrores = new Counter('otros_errores');
const exito = new Rate('salio_bien');

/**
 * Un cronómetro por cada acción, para saber qué parte del sistema aguanta y cuál no.
 *
 * Tienen que declararse AQUÍ, al cargar el guion. k6 no deja crear métricas
 * mientras la prueba corre: lanza "metrics must be declared in the init context"
 * en cada vuelta y el cuadro final sale vacío.
 */
const ACCIONES = [
    'alumno_panel', 'alumno_notas', 'alumno_asistencia', 'alumno_actividades', 'alumno_avisos',
    'profe_mis_secciones', 'profe_alumnos', 'profe_materias_seccion', 'profe_clase_en_vivo',
    'profe_guardar_clase', 'profe_observacion', 'profe_plan_evaluacion',
    'admin_panel', 'admin_usuarios', 'admin_alumnos', 'admin_materias', 'admin_secciones',
    'admin_ciclos', 'admin_crear_materia', 'admin_editar_materia', 'admin_borrar_materia',
    'admin_crear_alumno', 'admin_meter_en_seccion', 'admin_sacar_de_seccion',
    'admin_archivar_alumno', 'admin_borrar_alumno',
];

const porAccion = {};
for (const a of ACCIONES) porAccion[a] = new Trend(`accion_${a}`, true);

function anotarAccion(nombre, ms, ok) {
    const t = porAccion[nombre];
    if (t) t.add(ms);
    exito.add(ok);
}

// ─── Quién entra ──────────────────────────────────────────────────────────────
const CSV = './test-users-5k.csv';

const leerCsv = (prefijo, cuantos) =>
    open(CSV)
        .split('\n')
        .slice(1)
        .filter((l) => l.trim().startsWith(prefijo))
        .map((l) => {
            const p = l.trim().split(',');
            return { email: p[1], password: p[2] };
        })
        .slice(0, cuantos);

const CUANTOS_ALUMNOS = Number(__ENV.ALUMNOS || 300);
const CUANTOS_PROFESORES = Number(__ENV.PROFESORES || 30);
const CUANTOS_ADMINS = Number(__ENV.ADMINS || 3);

const alumnos = new SharedArray('alumnos', () => leerCsv('STUDENT', CUANTOS_ALUMNOS));
const profesores = new SharedArray('profesores', () => leerCsv('TEACHER', CUANTOS_PROFESORES));
const admins = new SharedArray('admins', () => leerCsv('ADMIN', CUANTOS_ADMINS));

/** Duración del tramo fuerte. Se acorta para comprobar que todo responde. */
const AGUANTE = __ENV.AGUANTE || '4m';
const SUBIDA = __ENV.SUBIDA || '30s';

const rampa = (objetivo) => [
    { duration: SUBIDA, target: objetivo },
    { duration: AGUANTE, target: objetivo },
    { duration: '15s', target: 0 },
];

export const options = {
    scenarios: {
        alumnos: { executor: 'ramping-vus', startVUs: 0, stages: rampa(CUANTOS_ALUMNOS), exec: 'diaDeAlumno' },
        profesores: { executor: 'ramping-vus', startVUs: 0, stages: rampa(CUANTOS_PROFESORES), exec: 'diaDeProfesor' },
        administradores: { executor: 'ramping-vus', startVUs: 0, stages: rampa(CUANTOS_ADMINS), exec: 'diaDeAdmin' },
    },
    thresholds: {},
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Modo diagnóstico: enseña el motivo de los primeros fallos.
 *
 * Sin esto, una prueba de carga solo dice "falló el 30%" y hay que adivinar
 * qué. Con `DIAGNOSTICO=1` se ven los códigos y el mensaje del servidor, que es
 * lo único que permite arreglarlo.
 */
const DIAGNOSTICO = __ENV.DIAGNOSTICO === '1';
let yaContados = 0;

function contarFallo(nombre, res) {
    if (!DIAGNOSTICO || yaContados >= 25) return;
    yaContados++;
    console.log(`  [fallo] ${nombre} -> ${res.status} ${String(res.body || '').slice(0, 160)}`);
}

function clasificarFallo(res) {
    const cuerpo = String(res.body || '');
    if (res.status === 503) servidorOcupado.add(1);
    else if (cuerpo.includes('connection pool')) sinConexion.add(1);
    else otrosErrores.add(1);
}

/** Abre una pantalla (una lectura). */
function mirar(nombre, url, cabeceras) {
    const res = http.get(url, { headers: cabeceras, timeout: '30s', tags: { name: nombre } });
    verPantalla.add(res.timings.duration);
    const ok = res.status === 200;
    anotarAccion(nombre, res.timings.duration, ok);
    if (!ok) {
        clasificarFallo(res);
        contarFallo(nombre, res);
    }
    check(res, { [`${nombre} responde`]: (r) => r.status === 200 });
    return res;
}

/**
 * Guarda algo (una escritura).
 *
 * Sin cuerpo se quita `Content-Type: application/json`: si se manda igual,
 * Fastify responde 400 ("Body cannot be empty when content-type is set to
 * 'application/json'") y parecería que el borrado está roto cuando lo roto es
 * la llamada.
 */
function escribir(nombre, metodo, url, cuerpo, cabeceras) {
    let usar = cabeceras;
    if (!cuerpo) {
        usar = {};
        for (const k of Object.keys(cabeceras)) {
            if (k.toLowerCase() !== 'content-type') usar[k] = cabeceras[k];
        }
    }

    const res = http.request(metodo, url, cuerpo ? JSON.stringify(cuerpo) : null, {
        headers: usar,
        timeout: '30s',
        tags: { name: nombre },
    });
    guardar.add(res.timings.duration);
    const ok = res.status >= 200 && res.status < 300;
    anotarAccion(nombre, res.timings.duration, ok);
    if (ok) guardadosHechos.add(1);
    else {
        guardadosFallidos.add(1);
        clasificarFallo(res);
        contarFallo(nombre, res);
    }
    return res;
}

function comoJson(res) {
    try {
        return JSON.parse(res.body);
    } catch {
        return null;
    }
}

/** Saca una lista de una respuesta, sea cual sea la forma que use ese endpoint. */
function lista(res, ...caminos) {
    const j = comoJson(res);
    if (!j) return [];
    for (const c of caminos) {
        const v = c.split('.').reduce((o, k) => (o == null ? o : o[k]), j);
        if (Array.isArray(v)) return v;
    }
    if (Array.isArray(j)) return j;
    return [];
}

const unico = () => `${__VU}-${__ITER}-${Date.now().toString(36).slice(-5)}`;

/**
 * Sufijo hecho SOLO de letras.
 *
 * El sistema valida que los apellidos lleven únicamente letras y espacios, y que
 * los códigos de materia sean mayúsculas y números. Un sufijo con guiones hace
 * que todas las altas se rechacen con 400 — y la prueba mediría rechazos.
 */
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function sufijoDeLetras(largo = 8) {
    let n = Date.now() + __VU * 100000 + __ITER;
    let s = '';
    for (let i = 0; i < largo; i++) {
        s += LETRAS[n % 26];
        n = Math.floor(n / 26);
    }
    return s;
}

// ─── Credenciales, una sola vez ───────────────────────────────────────────────

export function setup() {
    const entrar = (gente) => {
        const tokens = [];
        for (const p of gente) {
            const t = loginUser(p.email, p.password, config.instituteSlug);
            if (t) tokens.push(t);
        }
        return tokens;
    };

    const deAlumnos = entrar(alumnos);
    const deProfesores = entrar(profesores);
    const deAdmins = entrar(admins);

    console.log(
        `  entraron: ${deAlumnos.length} alumnos · ${deProfesores.length} profesores · ${deAdmins.length} administradores`
    );

    // Datos de partida que el admin necesita y que no debe crear en cada vuelta.
    let cicloId = null;
    let seccionId = null;
    if (deAdmins.length > 0) {
        const h = authHeaders(deAdmins[0], config.instituteSlug);
        const ciclos = lista(
            http.get(`${config.apiUrl}/api/academic-years`, { headers: h }),
            'academicYears',
            'data.items',
            'data'
        );
        cicloId = ciclos[0]?.id ?? null;

        const secciones = lista(
            http.get(`${config.apiUrl}/api/classrooms`, { headers: h }),
            'classrooms',
            'data.items',
            'data'
        );
        /**
         * Se crea una sección propia para la prueba, con sitio de sobra.
         *
         * En el liceo de carga las 100 secciones están llenas (50 de 50), y el
         * sistema rechaza cada alta con "capacidad máxima" —correctamente—. Sin
         * una sección con sitio no se puede medir meter ni sacar alumnos.
         *
         * Crear la sección es además una de las cosas que hace un admin de
         * verdad, así que entra en la prueba por derecho propio.
         */
        const letra = 'XYZWVUTS'[Math.floor(Math.random() * 8)];
        const nueva = http.post(
            `${config.apiUrl}/api/classrooms`,
            JSON.stringify({
                name: `Carga ${Date.now().toString(36).slice(-4)}`,
                grade: 1,
                section: letra,
                capacity: 500,
                academicYearId: cicloId,
            }),
            { headers: h }
        );
        const creada = comoJson(nueva);
        seccionId = creada?.id ?? creada?.classroom?.id ?? creada?.data?.id ?? null;

        // Si no se pudo crear (por ejemplo, porque ya existe esa sección), se
        // busca una que tenga sitio entre las que hay.
        if (!seccionId) {
            const otraVez = lista(
                http.get(`${config.apiUrl}/api/classrooms`, { headers: h }),
                'classrooms',
                'data.items',
                'data'
            );
            const conSitio = otraVez.find((c) => (c.capacity ?? 0) > 100);
            seccionId = (conSitio ?? otraVez[0])?.id ?? null;
            console.log(
                `  aviso: no se pudo crear la sección de pruebas (${nueva.status}); se usa ${seccionId}`
            );
        }
    }

    return { deAlumnos, deProfesores, deAdmins, cicloId, seccionId };
}

// ─── EL DÍA DE UN ALUMNO: de pantalla en pantalla ─────────────────────────────

export function diaDeAlumno(datos) {
    const tokens = datos.deAlumnos;
    if (!tokens || tokens.length === 0) return;
    const h = authHeaders(tokens[(__VU + __ITER) % tokens.length], config.instituteSlug);
    const api = config.apiUrl;

    mirar('alumno_panel', `${api}/api/dashboard/student`, h);
    mirar('alumno_notas', `${api}/api/students/my-grades`, h);
    mirar('alumno_asistencia', `${api}/api/students/my-attendance`, h);
    mirar('alumno_actividades', `${api}/api/activities/student/my-activities`, h);
    mirar('alumno_avisos', `${api}/api/notifications/my-notifications`, h);
}

// ─── EL DÍA DE UN PROFESOR: mira, pasa lista, observa y planifica ─────────────

export function diaDeProfesor(datos) {
    const tokens = datos.deProfesores;
    if (!tokens || tokens.length === 0) return;
    const h = authHeaders(tokens[(__VU + __ITER) % tokens.length], config.instituteSlug);
    const api = config.apiUrl;

    const misSecciones = mirar('profe_mis_secciones', `${api}/api/teachers/my-classrooms`, h);
    const secciones = lista(misSecciones, 'classrooms', 'data.classrooms', 'data');
    const seccion = secciones[0];
    if (!seccion?.id) return;

    const resAlumnos = mirar('profe_alumnos', `${api}/api/students?classroomId=${seccion.id}&limit=20`, h);
    const susAlumnos = lista(resAlumnos, 'students', 'data.items', 'data');
    const alumno = susAlumnos[Math.floor(Math.random() * susAlumnos.length)];

    const hoy = comoJson(http.get(`${api}/api/time`, { headers: h }));
    const fecha = hoy?.date ?? hoy?.data?.date;

    const materias = lista(
        mirar('profe_materias_seccion', `${api}/api/classrooms/${seccion.id}/subjects`, h),
        'classroomSubjects',
        'data.items',
        'data'
    );
    const materiaId = materias[0]?.subjectId ?? materias[0]?.subject?.id;

    if (materiaId && fecha) {
        mirar(
            'profe_clase_en_vivo',
            `${api}/api/sessions/live-detail?classroomId=${seccion.id}&subjectId=${materiaId}&date=${fecha}`,
            h
        );

        // Pasar lista: el guardado más habitual del día.
        escribir(
            'profe_guardar_clase',
            'POST',
            `${api}/api/sessions/live-save`,
            {
                classroomId: seccion.id,
                subjectId: materiaId,
                date: fecha,
                topic: `Clase ${unico()}`,
                attendances: susAlumnos.slice(0, 20).map((a) => ({ studentId: a.id, status: 'PRESENT' })),
            },
            h
        );
    }

    if (alumno?.id) {
        escribir(
            'profe_observacion',
            'POST',
            `${api}/api/observations`,
            {
                studentIds: [alumno.id],
                classroomId: seccion.id,
                title: `Observación ${unico()}`,
                description: 'Creada por la prueba de un día completo',
                type: 'OBSERVACION',
            },
            h
        );
    }

    // Tocar el plan de evaluación: los criterios tienen que sumar 20 puntos.
    if (materiaId) {
        escribir(
            'profe_plan_evaluacion',
            'POST',
            `${api}/api/evaluation-plan/rows/batch`,
            {
                classroomId: seccion.id,
                subjectId: materiaId,
                lapso: 'LAPSO_1',
                rows: [
                    {
                        weekNumber: 1,
                        rowType: 'EVALUATION',
                        title: `Criterio ${unico()}`,
                        actividadEval: 'Taller',
                        puntos: 20.0,
                        ponderacion: 100.0,
                    },
                ],
            },
            h
        );
    }
}

// ─── EL DÍA DE UN ADMIN: crear, editar, archivar, borrar ─────────────────────

export function diaDeAdmin(datos) {
    const tokens = datos.deAdmins;
    if (!tokens || tokens.length === 0) return;
    const h = authHeaders(tokens[(__VU + __ITER) % tokens.length], config.instituteSlug);
    const api = config.apiUrl;

    // Las pantallas que abre al llegar
    mirar('admin_panel', `${api}/api/dashboard/admin`, h);
    mirar('admin_usuarios', `${api}/api/users?limit=20`, h);
    mirar('admin_alumnos', `${api}/api/students?limit=20`, h);
    mirar('admin_materias', `${api}/api/subjects`, h);
    mirar('admin_secciones', `${api}/api/classrooms`, h);
    mirar('admin_ciclos', `${api}/api/academic-years`, h);

    const marca = unico();
    const letras = sufijoDeLetras();

    // ── Materia: crear, editar y borrar ──────────────────────────────────────
    const creada = escribir(
        'admin_crear_materia',
        'POST',
        `${api}/api/subjects`,
        { name: `Materia ${letras}`, code: `LC${letras.slice(0, 6)}`, description: 'prueba de carga' },
        h
    );
    const materiaId = comoJson(creada)?.subject?.id ?? comoJson(creada)?.data?.id ?? comoJson(creada)?.id;

    if (materiaId) {
        escribir('admin_editar_materia', 'PUT', `${api}/api/subjects/${materiaId}`, { name: `Materia ${marca} (editada)` }, h);
        escribir('admin_borrar_materia', 'DELETE', `${api}/api/subjects/${materiaId}`, null, h);
    }

    // ── Alumno: crear, meter en sección, sacarlo, archivar ───────────────────
    const nuevoAlumno = escribir(
        'admin_crear_alumno',
        'POST',
        `${api}/api/users`,
        {
            // El `id` del usuario ES la cédula, y la pone quien lo crea: el
            // sistema no la inventa. Sin ella, el alta falla con 500.
            id: `V-L${String(Date.now()).slice(-7)}${__VU}`,
            email: `carga.${letras.toLowerCase()}@testload.com`,
            firstName: 'Alumno',
            lastName: `Carga ${letras}`,
            role: 'STUDENT',
            password: 'Test123!',
            studentCode: `LC${marca.slice(-8)}`,
        },
        h
    );
    const alumnoId = comoJson(nuevoAlumno)?.user?.id ?? comoJson(nuevoAlumno)?.data?.id ?? comoJson(nuevoAlumno)?.id;

    if (alumnoId && datos.seccionId) {
        escribir(
            'admin_meter_en_seccion',
            'POST',
            `${api}/api/classrooms/${datos.seccionId}/students`,
            // En singular: este endpoint recibe UN alumno, no una lista.
            { studentId: alumnoId },
            h
        );
        // Sacar a un alumno de su sección exige la contraseña de quien lo hace.
        // Es una salvaguarda del sistema, no un fallo: se manda como la mandaría
        // la pantalla.
        escribir(
            'admin_sacar_de_seccion',
            'DELETE',
            `${api}/api/classrooms/${datos.seccionId}/students/${alumnoId}`,
            { password: 'Test123!' },
            h
        );
    }

    if (alumnoId) {
        escribir('admin_archivar_alumno', 'POST', `${api}/api/users/${alumnoId}/archive`, {}, h);
        // Se borra del todo para no dejar miles de alumnos de prueba en la base.
        // Pasa por la papelera, así que es recuperable.
        escribir('admin_borrar_alumno', 'DELETE', `${api}/api/users/${alumnoId}`, null, h);
    }
}

// ─── El cuadro final ──────────────────────────────────────────────────────────

export function handleSummary(datos) {
    const m = datos.metrics;
    const num = (x) => String(Math.round(x ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const ms = (metrica, campo) => Math.round(m[metrica]?.values?.[campo] ?? 0);
    const linea = (e, v) => `  ${e.padEnd(34)} ${v}`;

    const acciones = Object.keys(m)
        .filter((k) => k.startsWith('accion_'))
        .map((k) => ({
            nombre: k.replace('accion_', ''),
            media: Math.round(m[k]?.values?.avg ?? 0),
            p95: Math.round(m[k]?.values?.['p(95)'] ?? 0),
            peor: Math.round(m[k]?.values?.max ?? 0),
        }))
        .sort((a, b) => b.media - a.media);

    const filas = acciones.map(
        (a) =>
            `  ${a.nombre.padEnd(26)} ${String(a.media).padStart(7)} ms ${String(a.p95).padStart(8)} ms ${String(a.peor).padStart(8)} ms`
    );

    const texto = [
        '',
        '  ╔════════════════════════════════════════════════════════════════════╗',
        '  ║  UN DÍA COMPLETO DEL LICEO — TODO EL SISTEMA A LA VEZ              ║',
        '  ╚════════════════════════════════════════════════════════════════════╝',
        '',
        linea('Gente a la vez', `${CUANTOS_ALUMNOS} alumnos · ${CUANTOS_PROFESORES} profesores · ${CUANTOS_ADMINS} admins`),
        linea('Peticiones', num(m.http_reqs?.values?.count)),
        linea('Salieron bien', `${((m.salio_bien?.values?.rate ?? 0) * 100).toFixed(1)}%`),
        '',
        linea('Guardados hechos', num(m.guardados_hechos?.values?.count)),
        linea('Guardados fallidos', num(m.guardados_fallidos?.values?.count)),
        '',
        '  Por qué falló lo que falló:',
        linea('  sin conexión a la base', num(m.sin_conexion_a_la_base?.values?.count)),
        linea('  servidor ocupado (503)', num(m.servidor_ocupado_503?.values?.count)),
        linea('  otros', num(m.otros_errores?.values?.count)),
        '',
        linea('Ver una pantalla — media', `${ms('ver_pantalla_ms', 'avg')} ms`),
        linea('Ver una pantalla — p95', `${ms('ver_pantalla_ms', 'p(95)')} ms`),
        linea('Guardar — media', `${ms('guardar_ms', 'avg')} ms`),
        linea('Guardar — p95', `${ms('guardar_ms', 'p(95)')} ms`),
        '',
        '  ─── QUÉ ACCIÓN CUESTA MÁS (de peor a mejor) ───────────────────────',
        '  (una acción que no aparece es que no llegó a ejecutarse: las vueltas',
        '   se cortaron antes por lo lento que iba todo)',
        '',
        `  ${'ACCIÓN'.padEnd(26)} ${'MEDIA'.padStart(10)} ${'P95'.padStart(11)} ${'EL PEOR'.padStart(11)}`,
        `  ${'─'.repeat(26)} ${'─'.repeat(10)} ${'─'.repeat(11)} ${'─'.repeat(11)}`,
        ...filas,
        '',
    ].join('\n');

    const salida = { stdout: texto };
    if (__ENV.SUMMARY_JSON) salida[__ENV.SUMMARY_JSON] = JSON.stringify(datos, null, 2);
    return salida;
}
