import { avisar } from './avisos.service';
import { deCentimos, sumarDias } from './pagos.service';
import { cicloActivo, configuracionDelCiclo, hoyDelLiceo, leerConfiguracion, pagadoEnElCiclo, resumenDe } from '../controllers/pagos.controller';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * EL RECORDATORIO DE LA CUOTA (2026-10-01)
 *
 * Idea que eligió Cristian: avisarle al representante unos días antes de que
 * venza la cuota de su representado (`recordatorioDiasAntes` del ciclo; 3 por
 * defecto, 0 = no). Va a la campana, al tiempo real y al teléfono.
 *
 * Una sola vez por alumno, ciclo y cuota, aunque la tarea corra en varios
 * procesos a la vez o dos veces el mismo día: la fila de
 * `recordatorios_de_cuota` se inserta con `ON CONFLICT DO NOTHING` y solo
 * quien la insertó avisa. Si un día la tarea no corrió, al siguiente se avisa
 * igual de lo que vence dentro del plazo (no solo de lo que vence justo en N días).
 */
export async function recordarCuotas(prisma: any, instituteId: string, io: unknown, hoyForzado?: string): Promise<number> {
    const liceo = await leerConfiguracion(prisma);
    if (!liceo.enabled) return 0;
    const ciclo = await cicloActivo(prisma);
    if (!ciclo) return 0;
    const config = await configuracionDelCiclo(prisma, ciclo.id, liceo);
    const dias = config.recordatorioDiasAntes;
    if (!dias || dias <= 0) return 0;
    const hoy = hoyForzado ?? (await hoyDelLiceo(prisma));
    const hasta = sumarDias(hoy, dias);

    const [inscritos, planes, pagado, tutores] = await Promise.all([
        prisma.studentClassroom.findMany({
            where: { academicYearId: ciclo.id, isActive: true, student: { status: 'ACTIVE' } },
            select: { student: { select: { id: true, firstName: true, lastName: true } } },
        }),
        prisma.studentPaymentPlan.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, dueDay: true, exempt: true, descuentoPct: true } }),
        pagadoEnElCiclo(prisma, ciclo.id),
        prisma.studentTutor.findMany({ select: { studentId: true, tutorId: true } }),
    ]);
    const planDe = new Map<string, any>(planes.map((p: any) => [p.studentId, p]));
    const tutoresDe = new Map<string, string[]>();
    for (const t of tutores) tutoresDe.set(t.studentId, [...(tutoresDe.get(t.studentId) ?? []), t.tutorId]);

    let enviados = 0;
    const vistos = new Set<string>();
    for (const i of inscritos) {
        const id = i.student.id;
        if (vistos.has(id)) continue;
        vistos.add(id);
        const a = tutoresDe.get(id) ?? [];
        if (!a.length) continue;
        const r = resumenDe(config, ciclo, planDe.get(id), pagado, id, hoy);
        for (const c of r.cuotas) {
            if (c.state === 'EXONERADA' || c.pendingCents <= 0) continue;
            if (!(c.dueDate > hoy && c.dueDate <= hasta)) continue;
            const { count: insertados } = await prisma.recordatorioDeCuota.createMany({
                data: [{ studentId: id, academicYearId: ciclo.id, installmentKey: c.key }],
                skipDuplicates: true,
            });
            if (!insertados) continue;
            const fecha = c.dueDate.split('-').reverse().join('/');
            await avisar(prisma, instituteId, io as any, {
                a,
                titulo: `La cuota de ${i.student.firstName} vence el ${fecha}`,
                mensaje: `${c.label}: faltan ${deCentimos(c.pendingCents)} ${config.baseCurrency}. Si ya pagaste, puedes reportarlo con la captura desde la app.`,
                enlace: '/dashboard',
                tipo: 'CUOTA_POR_VENCER',
                alTelefono: { titulo: 'Una cuota está por vencer', cuerpo: `Vence el ${fecha}` },
            }).catch(avisarSiFalla('recordatorio-de-cuotas.service'));
            enviados++;
        }
    }
    return enviados;
}
