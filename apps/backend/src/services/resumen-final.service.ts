import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { redondearComoElMPPE } from './grades.service';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import { getAcademicConfig, condicionSugerida, SuggestionStatus } from './promotion/close-cycle.service';
import { AppErrors } from '../middleware/error.middleware';
import { apreciacionesFinalesDelCiclo } from './apreciaciones.service';
import { membreteDelLiceo, type Membrete } from './datos-del-plantel.service';
import { limpiarDatosDeDocumentos } from './constancias.service';

/**
 * EL RESUMEN FINAL DEL RENDIMIENTO DE UNA SECCIÓN
 *
 * Al cerrar el año, control de estudios llena para cada sección el «Resumen
 * Final del Rendimiento Estudiantil» del MPPE: una fila por alumno, una
 * columna por materia con su definitiva, y abajo cuántos aprobaron y
 * reprobaron cada una. Gestiedu tenía todas esas notas pero no las juntaba:
 * se pasaban a mano, alumno por alumno, desde cada boleta.
 *
 * Aquí se juntan con las MISMAS reglas que el cierre:
 *   - la definitiva de cada materia con el redondeo del liceo;
 *   - si la reprobó y presentó revisión, la nota de la revisión
 *     (`services/revision.service.ts`);
 *   - «sin notas» sale vacío y no cuenta ni como aprobada ni como reprobada;
 *   - una materia con apreciación sale con su apreciación final y no cuenta
 *     en el promedio ni en las reprobadas (CUALI-05);
 *   - la condición (promovido, con pendientes, repite) con `condicionSugerida`,
 *     la del cierre; con el ciclo ya cerrado, la que dejó el admin.
 *
 * Los TRES tipos del MPPE (`tipo`):
 *   - FINAL: las definitivas del año (la hoja imprime la definitiva);
 *   - REVISION: solo los alumnos que presentaron revisión, con esa nota;
 *   - MATERIA_PENDIENTE: los alumnos de la sección que cursaron materias
 *     pendientes este año, con la nota con que las aprobaron (o no).
 * Y lo que pide el formato: el membrete completo con el código del plan de
 * estudio, mes y año, los datos de cada alumno (cédula o cédula escolar,
 * lugar y entidad de nacimiento, sexo, fecha de nacimiento), la abreviatura
 * de cada materia, sus docentes y quien firma.
 *
 * Solo alumnos con inscripción activa en la sección; los retirados se cuentan
 * aparte. Lo ven el admin y el profesor GUÍA de la sección (son promedios de
 * todas las materias).
 *
 * Pruebas: RES-01…04, CUALI-05 y DOC-06.
 */

export type TipoDeResumen = 'FINAL' | 'REVISION' | 'MATERIA_PENDIENTE';
export const esTipoDeResumen = (v: unknown): v is TipoDeResumen => v === 'FINAL' || v === 'REVISION' || v === 'MATERIA_PENDIENTE';

type Nota = { definitiva: number | null; revision: number | null; apreciacion?: string | null; estado?: string | null };

export interface ResumenFinal {
    tipo: TipoDeResumen;
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null };
    membrete: Membrete;
    mesYAno: string;
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    ciclo: { id: string; nombre: string; cerrado: boolean };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    materias: Array<{
        id: string;
        nombre: string;
        cualitativa: boolean;
        abreviatura: string;
        docente: { nombre: string; cedula: string } | null;
        /** En el resumen de pendientes: el año de donde viene. */
        grado?: number;
    }>;
    alumnos: Array<{
        cedula: string;
        tipoDeCedula: string | null;
        cedulaEscolar: string | null;
        apellidos: string;
        nombres: string;
        sexo: string | null;
        fechaDeNacimiento: string | null;
        lugarDeNacimiento: string | null;
        entidadDeNacimiento: string | null;
        notas: Record<string, Nota>;
        reprobadas: number;
        promedio: number | null;
        condicion: SuggestionStatus;
    }>;
    porMateria: Record<string, { aprobados: number; reprobados: number; sinNotas: number }>;
    totales: { inscritos: number; retirados: number; promovidos: number; conPendientes: number; noPromovidos: number };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO'; maxPendientes: number };
    emitidoEl: string;
}

const media = (valores: number[]): number | null =>
    valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * LA ABREVIATURA DE CADA ÁREA EN EL RESUMEN
 *
 * La del plan de estudio del MPPE si el área es una de las suyas; si no, el
 * código del liceo cuando es una abreviatura (2 a 5 letras); si no, las
 * iniciales. El código interno del liceo («MT-12») no sirve: todas salían
 * «MT». Ver `abreviaturasSinRepetir`.
 */
const DEL_MPPE: Record<string, string> = {
    castellano: 'CA',
    'castellano y literatura': 'CA',
    ingles: 'IN',
    'ingles y otras lenguas extranjeras': 'ILE',
    matematica: 'MA',
    'educacion fisica': 'EF',
    'arte y patrimonio': 'AP',
    'ciencias naturales': 'CN',
    'geografia, historia y ciudadania': 'GHC',
    'orientacion y convivencia': 'OC',
    'grupos de creacion, recreacion y produccion': 'GCRP',
    fisica: 'FI',
    quimica: 'QU',
    biologia: 'BI',
    'ciencias de la tierra': 'CT',
    'formacion para la soberania nacional': 'FSN',
    historia: 'HI',
    geografia: 'GE',
    'catedra bolivariana': 'CB',
    computacion: 'CO',
    'estudio dirigido': 'ED',
};
const PALABRAS_VACIAS = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'para', 'en', 'con']);
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function abreviaturaDe(m: { name: string; code: string | null }): string {
    const conocida = DEL_MPPE[sinAcentos(m.name)];
    if (conocida) return conocida;
    const codigo = (m.code ?? '').trim().toUpperCase();
    if (/^[A-Z]{2,5}$/.test(codigo)) return codigo;
    const palabras = sinAcentos(m.name).split(/[\s,]+/).filter((p) => p && !PALABRAS_VACIAS.has(p));
    if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase();
    return palabras.map((p) => p[0]).join('').slice(0, 4).toUpperCase() || m.name.slice(0, 3).toUpperCase();
}

/** Si dos áreas quedan con la misma, la segunda lleva un número. */
function abreviaturasSinRepetir<T extends { abreviatura: string }>(columnas: T[]): T[] {
    const vistas = new Map<string, number>();
    return columnas.map((c) => {
        const n = (vistas.get(c.abreviatura) ?? 0) + 1;
        vistas.set(c.abreviatura, n);
        return n === 1 ? c : { ...c, abreviatura: `${c.abreviatura}${n}` };
    });
}

export async function resumenFinalDeLaSeccion(
    prisma: PrismaClient,
    instituteId: string,
    classroomId: string,
    hoy: string,
    tipo: TipoDeResumen = 'FINAL'
): Promise<ResumenFinal> {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            grade: true,
            section: true,
            shift: true,
            academicYearId: true,
            academicYear: { select: { id: true, name: true, status: true } },
            teacher: { select: { firstName: true, lastName: true } },
            subjects: {
                select: {
                    subject: { select: { id: true, name: true, code: true, evaluacion: true } },
                    teacher: { select: { id: true, firstName: true, lastName: true } },
                },
            },
        },
    });
    if (!seccion || !seccion.academicYearId || !seccion.academicYear) throw AppErrors.NotFound('Sección');
    const academicYearId = seccion.academicYearId;
    const ciclo = seccion.academicYear;

    const [config, liceo, membrete, inscripciones, revisiones, actas, apreciaciones] = await Promise.all([
        getAcademicConfig(instituteId),
        platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { name: true, code: true, address: true, city: true, academicConfig: true } }),
        membreteDelLiceo(instituteId),
        prisma.studentClassroom.findMany({
            where: { classroomId, academicYearId },
            select: {
                isActive: true,
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        gender: true,
                        birthDate: true,
                        tipoDeCedula: true,
                        cedulaEscolar: true,
                        lugarDeNacimiento: true,
                        entidadDeNacimiento: true,
                    },
                },
            },
        }),
        (prisma as any).notaDeRevision.findMany({
            where: { academicYearId },
            select: { studentId: true, subjectId: true, score: true },
        }),
        prisma.academicRecord.findMany({
            where: { academicYearId },
            select: { studentId: true, finalResult: true },
        }),
        apreciacionesFinalesDelCiclo(prisma, academicYearId),
    ]);
    const redondeo = config.redondeoDeDefinitivas ?? 'MPPE';
    const minima = config.notaMinimaAprobatoria;
    const revisionDe = new Map<string, number>(revisiones.map((r: any) => [`${r.studentId}|${r.subjectId}`, r.score]));
    const actaDe = new Map<string, string | null>(actas.map((a) => [a.studentId, a.finalResult]));
    const ultimoAno = config.maxGradeLevel ?? (config.modalidad === 'MEDIA_TECNICA' ? 6 : 5);
    const docs = limpiarDatosDeDocumentos(((liceo?.academicConfig ?? {}) as Record<string, unknown>).documentos);
    const [y, m] = hoy.split('-').map(Number);

    const materias = seccion.subjects
        .map((s) => ({ ...s.subject, docente: s.teacher }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const activos = inscripciones
        .filter((i) => i.isActive)
        .map((i) => i.student)
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es'));

    const porMateria: ResumenFinal['porMateria'] = {};
    for (const mat of materias) porMateria[mat.id] = { aprobados: 0, reprobados: 0, sinNotas: 0 };

    // La definitiva de cada alumno en cada materia: la misma cuenta que
    // `gradesService.promedioDeLaMateria(…, lapsos, redondeo)` —cada lapso con
    // notas, con su redondeo, y su media redondeada otra vez—, pero con los
    // promedios de cada lapso EN BLOQUE para toda la sección. Alumno por
    // alumno eran ~6 consultas más por alumno (N1-14): una sección de 40,
    // cientos.
    const definitivas = new Map<string, { promedio: number; conNotas: boolean }>();
    // Los lapsos de ESTE año: con un año ya cerrado, el alumno tiene también
    // la inscripción del siguiente, y sin ellos se tomaban los de esa.
    const lapsos = (await prisma.period.findMany({ where: { academicYearId }, select: { id: true } })).map((p) => p.id);
    if (tipo !== 'MATERIA_PENDIENTE') {
        const definitiva = (n: number) => (redondeo === 'MPPE' ? redondearComoElMPPE(n) : n);
        const porLapso = await Promise.all(
            lapsos.map((periodId) =>
                bulkSubjectAveragesConDatos(prisma, {
                    classroomId,
                    studentIds: activos.map((a) => a.id),
                    subjectIds: materias.filter((m) => m.evaluacion !== 'CUALITATIVA').map((m) => m.id),
                    periodId,
                })
            )
        );
        for (const a of activos) {
            for (const mat of materias) {
                const sumas = porLapso
                    .map((d) => d.get(a.id)?.get(mat.id))
                    .filter((v): v is { promedio: number; conNotas: boolean } => Boolean(v?.conNotas))
                    .map((v) => definitiva(v.promedio));
                definitivas.set(
                    `${a.id}|${mat.id}`,
                    sumas.length === 0
                        ? { promedio: 0, conNotas: false }
                        : { promedio: definitiva(Math.round((sumas.reduce((x, y) => x + y, 0) / sumas.length) * 100) / 100), conNotas: true }
                );
            }
        }
    }

    const datosDelAlumno = (a: (typeof activos)[number]) => ({
        cedula: a.id,
        tipoDeCedula: a.tipoDeCedula ?? null,
        cedulaEscolar: a.cedulaEscolar ?? null,
        apellidos: a.lastName,
        nombres: a.firstName,
        sexo: a.gender ?? null,
        fechaDeNacimiento: a.birthDate ? a.birthDate.toISOString().slice(0, 10) : null,
        lugarDeNacimiento: a.lugarDeNacimiento ?? null,
        entidadDeNacimiento: a.entidadDeNacimiento ?? null,
    });

    let alumnos: ResumenFinal['alumnos'] = [];
    let columnas: ResumenFinal['materias'] = materias.map((mat) => ({
        id: mat.id,
        nombre: mat.name,
        cualitativa: mat.evaluacion === 'CUALITATIVA',
        abreviatura: abreviaturaDe(mat),
        docente: mat.docente ? { nombre: `${mat.docente.firstName} ${mat.docente.lastName}`, cedula: mat.docente.id } : null,
    }));

    if (tipo === 'MATERIA_PENDIENTE') {
        // Las pendientes que los alumnos de esta sección cursaron este año.
        const pendientes = await (prisma as any).materiaPendiente.findMany({
            where: { cicloId: academicYearId, studentId: { in: activos.map((a) => a.id) } },
            select: {
                studentId: true,
                gradoDeOrigen: true,
                estado: true,
                notaFinal: true,
                subject: { select: { id: true, name: true, code: true } },
                profesor: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        const porColumna = new Map<string, ResumenFinal['materias'][number]>();
        for (const p of pendientes) {
            const clave = `${p.subject.id}|${p.gradoDeOrigen}`;
            if (!porColumna.has(clave)) {
                porColumna.set(clave, {
                    id: clave,
                    nombre: `${p.subject.name} (${p.gradoDeOrigen}º)`,
                    cualitativa: false,
                    abreviatura: `${abreviaturaDe(p.subject)}${p.gradoDeOrigen}`,
                    docente: p.profesor ? { nombre: `${p.profesor.firstName} ${p.profesor.lastName}`, cedula: p.profesor.id } : null,
                    grado: p.gradoDeOrigen,
                });
            }
        }
        columnas = [...porColumna.values()].sort((a, b) => (a.grado ?? 0) - (b.grado ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
        for (const c of columnas) porMateria[c.id] = { aprobados: 0, reprobados: 0, sinNotas: 0 };
        for (const a of activos) {
            const suyas = pendientes.filter((p: any) => p.studentId === a.id);
            if (suyas.length === 0) continue;
            const notas: Record<string, Nota> = {};
            let reprobadas = 0;
            for (const p of suyas) {
                const clave = `${p.subject.id}|${p.gradoDeOrigen}`;
                notas[clave] = { definitiva: p.notaFinal ?? null, revision: null, estado: p.estado };
                if (p.estado === 'APROBADA') porMateria[clave].aprobados++;
                else if (p.estado === 'NO_APROBADA') {
                    porMateria[clave].reprobados++;
                    reprobadas++;
                } else porMateria[clave].sinNotas++;
            }
            alumnos.push({
                ...datosDelAlumno(a),
                notas,
                reprobadas,
                promedio: media(suyas.filter((p: any) => p.notaFinal != null).map((p: any) => p.notaFinal)),
                condicion: reprobadas > 0 ? 'NO_PROMOVIDO' : suyas.every((p: any) => p.estado === 'APROBADA') ? 'PROMOVIDO' : 'PROMOVIDO_CON_PENDIENTES',
            });
        }
    } else {
        for (const a of activos) {
            const notas: Record<string, Nota> = {};
            const queCuentan: number[] = [];
            let reprobadas = 0;
            let conRevision = false;
            for (const mat of materias) {
                if (mat.evaluacion === 'CUALITATIVA') {
                    notas[mat.id] = { definitiva: null, revision: null, apreciacion: apreciaciones.get(`${a.id}|${mat.id}`) ?? null };
                    continue;
                }
                const def = definitivas.get(`${a.id}|${mat.id}`)!;
                if (!def.conNotas) {
                    notas[mat.id] = { definitiva: null, revision: null };
                    if (tipo === 'FINAL') porMateria[mat.id].sinNotas++;
                    continue;
                }
                const revision = def.promedio < minima ? (revisionDe.get(`${a.id}|${mat.id}`) ?? null) : null;
                if (revision !== null) conRevision = true;
                const cuenta = revision ?? def.promedio;
                notas[mat.id] = { definitiva: def.promedio, revision };
                queCuentan.push(cuenta);
                if (tipo === 'REVISION') {
                    if (revision !== null) {
                        if (revision >= minima) porMateria[mat.id].aprobados++;
                        else porMateria[mat.id].reprobados++;
                    }
                } else if (cuenta >= minima) porMateria[mat.id].aprobados++;
                else porMateria[mat.id].reprobados++;
                if (cuenta < minima) reprobadas++;
            }
            if (tipo === 'REVISION' && !conRevision) continue;
            const acta = actaDe.get(a.id);
            alumnos.push({
                ...datosDelAlumno(a),
                notas,
                reprobadas,
                promedio: media(queCuentan),
                condicion: (acta as SuggestionStatus) || condicionSugerida(reprobadas, seccion.grade >= ultimoAno, config),
            });
        }
    }

    return {
        tipo,
        liceo: {
            nombre: liceo?.name ?? '',
            codigo: liceo?.code ?? null,
            direccion: liceo?.address ?? null,
            ciudad: liceo?.city ?? null,
        },
        membrete,
        mesYAno: `${MESES[m - 1]} ${y}`,
        firmante: { nombre: docs.firmanteNombre ?? null, cedula: docs.firmanteCedula ?? null, cargo: docs.firmanteCargo ?? 'Director(a)' },
        ciclo: { id: ciclo.id, nombre: ciclo.name, cerrado: ciclo.status === 'COMPLETED' },
        seccion: {
            id: seccion.id,
            grado: seccion.grade,
            seccion: seccion.section,
            turno: (seccion as any).shift ?? null,
            guia: seccion.teacher ? `${seccion.teacher.firstName} ${seccion.teacher.lastName}` : null,
        },
        materias: abreviaturasSinRepetir(columnas),
        alumnos,
        porMateria,
        totales: {
            inscritos: alumnos.length,
            retirados: inscripciones.filter((i) => !i.isActive).length,
            promovidos: alumnos.filter((a) => a.condicion === 'PROMOVIDO').length,
            conPendientes: alumnos.filter((a) => a.condicion === 'PROMOVIDO_CON_PENDIENTES').length,
            noPromovidos: alumnos.filter((a) => a.condicion === 'NO_PROMOVIDO').length,
        },
        reglas: { notaMinima: minima, redondeo, maxPendientes: config.maxMateriasPendientesParaPromover },
        emitidoEl: hoy,
    };
}

/** El admin, o el profesor guía de la sección. */
export async function puedeVerElResumen(
    prisma: PrismaClient,
    user: { id?: string; userId?: string; role?: string } | null | undefined,
    classroomId: string
): Promise<boolean> {
    const actor = user?.userId ?? user?.id;
    if (!actor || !user?.role) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER') return false;
    return (await prisma.classroom.count({ where: { id: classroomId, teacherId: actor } })) > 0;
}
