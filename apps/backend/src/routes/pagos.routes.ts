import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
    annulPayment,
    getMyChildrenPayments,
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

    fastify.get(
        '/students/:studentId',
        { schema: { params: { type: 'object', required: ['studentId'], properties: { studentId: id } } }, preHandler: [authenticate] },
        getStudentPayments as any
    );

    fastify.put(
        '/students/:studentId/plan',
        {
            schema: {
                params: { type: 'object', required: ['studentId'], properties: { studentId: id } },
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
