import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
    annulPayment,
    getMyChildrenPayments,
    getPaymentCycles,
    getPaymentsMonth,
    getPaymentReceipt,
    getPaymentSettings,
    getPaymentsOverview,
    getStudentPayments,
    registerPayment,
    updatePaymentSettings,
    updateStudentPlan,
} from '../controllers/pagos.controller';

/**
 * Pagos. Los permisos finos (el representante solo ve a los suyos; con el
 * módulo apagado nada responde) están en el controlador.
 */
export async function pagosRoutes(fastify: FastifyInstance) {
    const id = { type: 'string', minLength: 1, maxLength: 64 };

    fastify.get('/settings', { preHandler: [authenticate] }, getPaymentSettings as any);

    fastify.put(
        '/settings',
        {
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['enabled', 'frequency', 'dueMode', 'dueDay', 'graceDays', 'baseCurrency', 'acceptedCurrencies', 'feeAmount', 'enrollmentEnabled', 'methods'],
                    properties: {
                        enabled: { type: 'boolean' },
                        frequency: { type: 'string', enum: ['MONTHLY', 'BIWEEKLY', 'PER_PERIOD'] },
                        dueMode: { type: 'string', enum: ['SAME_DAY', 'PER_STUDENT'] },
                        dueDay: { type: 'integer', minimum: 1, maximum: 28 },
                        graceDays: { type: 'integer', minimum: 0, maximum: 60 },
                        baseCurrency: { type: 'string', enum: ['USD', 'VES'] },
                        acceptedCurrencies: { type: 'string', enum: ['USD', 'VES', 'BOTH'] },
                        feeAmount: { type: ['number', 'string'] },
                        enrollmentEnabled: { type: 'boolean' },
                        enrollmentAmount: { type: ['number', 'string'] },
                        methods: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 30 } },
                        // Lo nuevo (2026-10-01): descuento por hermanos, mora y recordatorio.
                        descuentoHermanosPct: { type: 'integer', minimum: 0, maximum: 100 },
                        moraTipo: { type: 'string', enum: ['NINGUNA', 'FIJA', 'PORCENTAJE'] },
                        moraValor: { type: ['number', 'string'] },
                        moraDiasDespues: { type: 'integer', minimum: 0, maximum: 90 },
                        recordatorioDiasAntes: { type: 'integer', minimum: 0, maximum: 15 },
                    },
                },
            },
            preHandler: [authenticate, requireAdmin],
        },
        updatePaymentSettings as any
    );

    fastify.get(
        '/overview',
        { schema: { querystring: { type: 'object', properties: { academicYearId: id } } }, preHandler: [authenticate, requireAdmin] },
        getPaymentsOverview as any
    );

    // El representante: sus representados. Rol comprobado en el controlador
    // (solo devuelve los vínculos del que llama; cualquier otro rol recibe lista vacía).
    fastify.get('/my-children', { preHandler: [authenticate] }, getMyChildrenPayments as any);

    // Los ciclos, para elegir cuál mirar (también los pasados).
    fastify.get('/cycles', { preHandler: [authenticate, requireAdmin] }, getPaymentCycles as any);

    // El mes en días, para el calendario (qué vence y quién pagó cada día).
    fastify.get(
        '/month',
        {
            schema: {
                // El mes se revisa en el controlador, DESPUÉS de mirar si el
                // módulo está encendido: apagado, todo responde 403 (PAGOS-APAGADO-01).
                querystring: { type: 'object', properties: { academicYearId: id, month: { type: 'string', maxLength: 7 } } },
            },
            preHandler: [authenticate, requireAdmin],
        },
        getPaymentsMonth as any
    );

    fastify.get(
        '/students/:studentId',
        {
            schema: {
                params: { type: 'object', required: ['studentId'], properties: { studentId: id } },
                querystring: { type: 'object', properties: { academicYearId: id } },
            },
            preHandler: [authenticate],
        },
        getStudentPayments as any
    );

    fastify.put(
        '/students/:studentId/plan',
        {
            schema: {
                params: { type: 'object', required: ['studentId'], properties: { studentId: id } },
                querystring: { type: 'object', properties: { academicYearId: id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        dueDay: { type: ['integer', 'null'], minimum: 1, maximum: 28 },
                        exempt: { type: 'boolean' },
                        exemptReason: { type: ['string', 'null'], maxLength: 200 },
                    },
                },
            },
            preHandler: [authenticate, requireAdmin],
        },
        updateStudentPlan as any
    );

    fastify.post(
        '/students/:studentId/payments',
        {
            schema: {
                params: { type: 'object', required: ['studentId'], properties: { studentId: id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['installmentKeys', 'amount', 'currency', 'method', 'paidAt'],
                    properties: {
                        installmentKeys: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'string', maxLength: 40 } },
                        amount: { type: ['number', 'string'] },
                        currency: { type: 'string', enum: ['USD', 'VES'] },
                        exchangeRate: { type: ['number', 'string', 'null'] },
                        method: { type: 'string', maxLength: 30 },
                        reference: { type: ['string', 'null'], maxLength: 60 },
                        notes: { type: ['string', 'null'], maxLength: 200 },
                        paidAt: { type: 'string', maxLength: 10 },
                        academicYearId: id,
                    },
                },
            },
            preHandler: [authenticate, requireAdmin],
        },
        registerPayment as any
    );

    fastify.post(
        '/:paymentId/annul',
        {
            schema: {
                params: { type: 'object', required: ['paymentId'], properties: { paymentId: id } },
                body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: { type: 'string', maxLength: 200 } } },
            },
            preHandler: [authenticate, requireAdmin],
        },
        annulPayment as any
    );

    fastify.get(
        '/:paymentId/receipt',
        { schema: { params: { type: 'object', required: ['paymentId'], properties: { paymentId: id } } }, preHandler: [authenticate] },
        getPaymentReceipt as any
    );
}
