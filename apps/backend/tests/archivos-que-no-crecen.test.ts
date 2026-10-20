import * as fs from 'fs';
import * as path from 'path';

/**
 * NINGÚN ARCHIVO DE CÓDIGO CRECE SIN FIN (Cristian, 19-oct-2026; CLAUDE.md 0-ter)
 *
 * «Está mal que un solo archivo tenga 2.000 líneas.» Un archivo así mezcla
 * cosas, se lee mal y cada cambio arriesga lo de al lado. La meta es ~800
 * líneas por archivo, partido por responsabilidad (no por número).
 *
 * TAMAÑO-01: un archivo nuevo, o uno que hoy no pasa de 800, no pasa de 1.000.
 * TAMAÑO-02: los que ya pasan de 800 están en esta lista con su tope de hoy;
 *            pueden bajar (y entonces se baja el tope), nunca subir.
 *
 * Solo el código de la app: no las pruebas, los guiones de medir ni las semillas.
 */
const RAIZ = path.resolve(__dirname, '../../..');
const GRANDES: Record<string, number> = {
    'apps/backend/src/controllers/classSessions.controller.ts': 1730,
    'apps/backend/src/controllers/users.controller.ts': 1626,
    'apps/web/src/app/(dashboard)/dashboard/clase-en-vivo/[classroomId]/[subjectId]/page.tsx': 1457,
    'apps/web/src/components/evaluation/EvaluationPlanSection.tsx': 1408,
    'apps/backend/src/controllers/pagos.controller.ts': 1264,
    'apps/backend/src/controllers/finanzas.controller.ts': 1241,
    'apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/promocion/page.tsx': 1205,
    'apps/backend/src/services/promotion/close-cycle.service.ts': 1199,
    'apps/backend/src/services/dashboard.service.ts': 1193,
    'apps/backend/src/controllers/classrooms.controller.ts': 1122,
    'apps/backend/src/controllers/evaluation-plan.controller.ts': 1036,
    'apps/backend/src/services/grades.service.ts': 1035,
    'apps/backend/src/controllers/students.controller.ts': 1031,
    'apps/backend/src/controllers/attendance.controller.ts': 1012,
    'apps/backend/src/controllers/classroomSubjects.controller.ts': 1000,
    'apps/web/src/components/landing/escaparate/Pantallas.tsx': 986,
    'apps/web/src/components/finanzas/NuevoMovimiento.tsx': 969,
    'apps/backend/src/controllers/observations.controller.ts': 952,
    'apps/web/src/components/schedule/StudentScheduleSection.tsx': 946,
    'apps/web/src/lib/precarga.ts': 941,
    'apps/web/src/components/schedule/TeacherScheduleEditor.tsx': 916,
    'apps/web/src/app/(dashboard)/dashboard/academico/[cycleId]/[sectionId]/page.tsx': 910,
    'apps/backend/src/controllers/superadmin-institutes.controller.ts': 864,
    'apps/web/src/app/(dashboard)/dashboard/usuarios/[cedula]/page.tsx': 851,
    'apps/backend/src/services/materias-pendientes.service.ts': 821,
    'apps/backend/src/controllers/academic-years.controller.ts': 817,
};
const TOPE_NUEVO = 1000;

function archivos(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const r = path.join(dir, e.name);
        if (e.isDirectory()) return ['node_modules', 'generated', 'scripts', 'prisma', '.next'].includes(e.name) ? [] : archivos(r);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [r] : [];
    });
}
const lineas = (f: string) => fs.readFileSync(f, 'utf8').split('\n').length - 1;

describe('Los archivos no crecen sin fin (TAMAÑO)', () => {
    const todos = [...archivos(path.join(RAIZ, 'apps/backend/src')), ...archivos(path.join(RAIZ, 'apps/web/src'))].map((f) => [path.relative(RAIZ, f).split(path.sep).join('/'), lineas(f)] as const);

    it('TAMAÑO-01: ninguno nuevo pasa de 1.000 líneas', () => {
        const fuera = todos.filter(([f, n]) => !(f in GRANDES) && n > TOPE_NUEVO).map(([f, n]) => `${f}: ${n}`);
        expect(fuera).toEqual([]);
    });

    it('TAMAÑO-02: los grandes de la lista no crecen (pueden bajar)', () => {
        const crecieron = todos.filter(([f, n]) => f in GRANDES && n > GRANDES[f]).map(([f, n]) => `${f}: ${n} > ${GRANDES[f]}`);
        expect(crecieron).toEqual([]);
    });
});
