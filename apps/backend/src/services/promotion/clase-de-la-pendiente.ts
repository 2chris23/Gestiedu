/**
 * LA CLASE DE CADA MATERIA PENDIENTE (`materias-pendientes.service`)
 *
 * Aparte para que la usen el cierre del año y la pendiente sin importarse
 * el uno al otro.
 */

/**
 * Las pendientes de un año que aún no tienen clase reciben la suya, todas en
 * bloque: la de su materia y grado de origen ese año; antes, la del profesor
 * que la tenía puesto; luego, la de la misma letra que su sección del año en
 * que la reprobó; si no, la primera. Si su profesor era el de esa clase, deja
 * de ir a mano (así un cambio de profesor en la clase le llega).
 */
export async function asignarLasClases(prisma: any, cicloId: string): Promise<number> {
    const sinClase = await prisma.materiaPendiente.findMany({
        where: { cicloId, claseId: null },
        select: { id: true, studentId: true, subjectId: true, gradoDeOrigen: true, cicloDeOrigenId: true, profesorId: true },
    });
    if (sinClase.length === 0) return 0;
    const clases = await prisma.classroomSubject.findMany({
        where: {
            subjectId: { in: [...new Set(sinClase.map((p: any) => p.subjectId))] },
            classroom: { academicYearId: cicloId, grade: { in: [...new Set(sinClase.map((p: any) => p.gradoDeOrigen))] } },
        },
        select: { id: true, subjectId: true, teacherId: true, classroom: { select: { grade: true, section: true } } },
        orderBy: { classroom: { section: 'asc' } },
    });
    if (clases.length === 0) return 0;
    const antes = await prisma.studentClassroom.findMany({
        where: {
            studentId: { in: [...new Set(sinClase.map((p: any) => p.studentId))] },
            academicYearId: { in: [...new Set(sinClase.map((p: any) => p.cicloDeOrigenId))] },
        },
        select: { studentId: true, academicYearId: true, classroom: { select: { section: true } } },
    });
    const letraDe = new Map(antes.map((a: any) => [`${a.studentId}|${a.academicYearId}`, a.classroom.section]));

    // Agrupadas por la clase que les toca, para escribir en bloque.
    const porClase = new Map<string, { conProfesor: string[]; sinProfesor: string[] }>();
    for (const p of sinClase) {
        const candidatas = clases.filter((c: any) => c.subjectId === p.subjectId && c.classroom.grade === p.gradoDeOrigen);
        if (candidatas.length === 0) continue;
        const letra = letraDe.get(`${p.studentId}|${p.cicloDeOrigenId}`);
        const elegida =
            (p.profesorId && candidatas.find((c: any) => c.teacherId === p.profesorId)) || candidatas.find((c: any) => c.classroom.section === letra) || candidatas[0];
        const g = porClase.get(elegida.id) ?? { conProfesor: [], sinProfesor: [] };
        // El profesor que traía es el de la clase: ya no hace falta a mano.
        (p.profesorId && p.profesorId !== elegida.teacherId ? g.conProfesor : g.sinProfesor).push(p.id);
        porClase.set(elegida.id, g);
    }
    let hechas = 0;
    for (const [claseId, g] of porClase) {
        if (g.sinProfesor.length) hechas += (await prisma.materiaPendiente.updateMany({ where: { id: { in: g.sinProfesor } }, data: { claseId, profesorId: null } })).count;
        if (g.conProfesor.length) hechas += (await prisma.materiaPendiente.updateMany({ where: { id: { in: g.conProfesor } }, data: { claseId } })).count;
    }
    return hechas;
}
