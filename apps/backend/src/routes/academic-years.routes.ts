import { FastifyPluginAsync } from 'fastify';
import {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    changeYearStatus,
    deleteAcademicYear,
    getAcademicYearStats,
    updateAcademicYear,
    prepareAcademicYearClose,
    confirmAcademicYearClose,
    getCloseStrategies,
    getPromotionContext,
    previewPromotionStrategy
} from '../controllers/academic-years.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { listarRevisiones, guardarRevision, borrarRevision } from '../controllers/revision.controller';
import {
    verEstado,
    verFaltantes,
    verRevision,
    verDecisiones,
    ponerDecision,
    nuevoAnoSiguiente,
    corregir,
    verExpedientes,
} from '../controllers/fin-de-ano.controller';

const idCorto = { type: 'string', minLength: 1, maxLength: 64 } as const;
const condicion = { type: 'string', enum: ['PROMOVIDO', 'PROMOVIDO_CON_PENDIENTES', 'NO_PROMOVIDO'] } as const;
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

const academicYearsRoutes: FastifyPluginAsync = async (fastify) => {
    // Rutas públicas o protegidas nivel usuario básico (si las hubiera)

    // Rutas protegidas (Admin)
    fastify.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', authenticate);

        // Todos pueden ver los años escolares (para filtros)
        protectedRoutes.get('/', getAcademicYears);
        protectedRoutes.get('/active', getActiveAcademicYear);
        protectedRoutes.get('/:id/stats', getAcademicYearStats);

        // Solo admin puede modificar
        protectedRoutes.register(async (adminRoutes) => {
            adminRoutes.addHook('preHandler', requireAdmin);

            adminRoutes.post('/', createAcademicYear);
            adminRoutes.put('/:id', updateAcademicYear);
            adminRoutes.put('/:id/status', changeYearStatus);
            adminRoutes.delete('/:id', deleteAcademicYear);

            // Fase 3.5-C — cierre de ciclo escolar + prosecución
            adminRoutes.get('/close/strategies', getCloseStrategies);
            adminRoutes.post('/:id/close/prepare', prepareAcademicYearClose);
            adminRoutes.post('/:id/close', confirmAcademicYearClose);
            // La revisión de las materias reprobadas, antes del cierre
            // (services/revision.service.ts).
            adminRoutes.get('/:id/revisiones', listarRevisiones as any);
            adminRoutes.put('/:id/revisiones', guardarRevision as any);
            adminRoutes.delete('/:id/revisiones/:revisionId', borrarRevision as any);
            // El fin del año por pasos (services/fin-de-ano.service.ts).
            adminRoutes.get('/:id/cierre', verEstado as any);
            adminRoutes.get('/:id/cierre/faltantes', verFaltantes as any);
            adminRoutes.get('/:id/cierre/revision', verRevision as any);
            adminRoutes.get('/:id/cierre/decisiones', verDecisiones as any);
            adminRoutes.get('/:id/cierre/expedientes', verExpedientes as any);
            adminRoutes.put('/:id/cierre/decisiones/:studentId', {
                preHandler: [authenticate, requireAdmin],
                schema: {
                    body: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['condicion'],
                        properties: { condicion, motivo: { type: 'string', maxLength: 500 } },
                    },
                },
            }, ponerDecision as any);
            adminRoutes.post('/:id/cierre/ano-siguiente', {
                preHandler: [authenticate, requireAdmin],
                schema: {
                    body: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            nombre: { type: 'string', minLength: 1, maxLength: 40 },
                            inicio: fecha,
                            fin: fecha,
                            lapsos: {
                                type: 'array',
                                minItems: 1,
                                maxItems: 6,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['nombre', 'inicio', 'fin'],
                                    properties: {
                                        nombre: { type: 'string', minLength: 1, maxLength: 40 },
                                        inicio: fecha,
                                        fin: fecha,
                                        inicioDelPlan: { type: ['string', 'null'] },
                                        nombreAntesDelPlan: { type: ['string', 'null'], maxLength: 40 },
                                    },
                                },
                            },
                            copiar: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    secciones: { type: 'boolean' },
                                    profesores: { type: 'boolean' },
                                    horarios: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
            }, nuevoAnoSiguiente as any);
            adminRoutes.put('/:id/cierre/correccion/:studentId', {
                preHandler: [authenticate, requireAdmin],
                schema: {
                    body: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['condicion', 'motivo'],
                        properties: {
                            condicion,
                            motivo: { type: 'string', maxLength: 500 },
                            destinoClassroomId: { type: ['string', 'null'], maxLength: 64 },
                        },
                    },
                },
            }, corregir as any);
            // Fase 3.5 Parte 2 — página de promoción
            adminRoutes.get('/:id/promotion-context', getPromotionContext);
            adminRoutes.post('/:id/promotion/strategy-preview', previewPromotionStrategy);
        });
    });
};

export default academicYearsRoutes;
export { academicYearsRoutes };
