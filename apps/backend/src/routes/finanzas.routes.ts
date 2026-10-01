import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
    anularFondo,
    anularGasto,
    anularPagoAlPersonal,
    aplicarATodos,
    crearFondo,
    crearGasto,
    crearPersona,
    editarPersona,
    getComprobante,
    getFondos,
    getGastos,
    getMes,
    getMisPagos,
    getPersona,
    getPersonal,
    getReciboDelPersonal,
    getResumen,
    guardarAcuerdo,
    guardarCategorias,
    guardarNomina,
    pagarAlPersonal,
    subirComprobante,
} from '../controllers/finanzas.controller';

/**
 * LAS FINANZAS DEL LICEO (2026-10-01). Todo del admin, salvo `mis-pagos` (cada
 * quien lo suyo) y el recibo, que también puede pedir la persona a la que se
 * le pagó (el controlador lo comprueba). Con el módulo de pagos apagado,
 * todo responde 403.
 */
export async function finanzasRoutes(fastify: FastifyInstance) {
    const id = { type: 'string', minLength: 1, maxLength: 64 };
    const conId = { type: 'object', required: ['id'], properties: { id } };
    const delCiclo = { type: 'object', properties: { academicYearId: id } };
    const admin = { preHandler: [authenticate, requireAdmin] };
    const dinero = {
        monto: { type: ['number', 'string'] },
        moneda: { type: 'string', enum: ['USD', 'VES'] },
        tasa: { type: ['number', 'string', 'null'] },
    };
    const motivo = { type: 'object', additionalProperties: false, required: ['motivo'], properties: { motivo: { type: 'string', maxLength: 200 } } };

    fastify.get('/resumen', { ...admin, schema: { querystring: delCiclo } }, getResumen as any);
    fastify.get('/mes', { ...admin, schema: { querystring: { type: 'object', properties: { academicYearId: id, mes: { type: 'string', maxLength: 7 } } } } }, getMes as any);

    fastify.get('/fondos', { ...admin, schema: { querystring: delCiclo } }, getFondos as any);
    fastify.post(
        '/fondos',
        {
            ...admin,
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['concepto', 'fecha', 'monto'],
                    properties: { concepto: { type: 'string', enum: ['SALDO_INICIAL', 'DONACION', 'OTRO'] }, fecha: { type: 'string', maxLength: 10 }, descripcion: { type: ['string', 'null'], maxLength: 200 }, ...dinero },
                },
            },
        },
        crearFondo as any
    );
    fastify.post('/fondos/:id/anular', { ...admin, schema: { params: conId, body: motivo } }, anularFondo as any);

    fastify.get('/gastos', { ...admin, schema: { querystring: delCiclo } }, getGastos as any);
    fastify.post(
        '/gastos',
        {
            ...admin,
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['concepto', 'categoria', 'fecha', 'monto'],
                    properties: {
                        concepto: { type: 'string', maxLength: 120 },
                        categoria: { type: 'string', maxLength: 40 },
                        fecha: { type: 'string', maxLength: 10 },
                        proveedor: { type: ['string', 'null'], maxLength: 120 },
                        notas: { type: ['string', 'null'], maxLength: 300 },
                        comprobanteId: { type: ['string', 'null'], maxLength: 64 },
                        ...dinero,
                    },
                },
            },
        },
        crearGasto as any
    );
    fastify.post('/gastos/:id/anular', { ...admin, schema: { params: conId, body: motivo } }, anularGasto as any);
    fastify.put(
        '/categorias',
        { ...admin, schema: { body: { type: 'object', additionalProperties: false, required: ['categorias'], properties: { categorias: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 40 } } } } } },
        guardarCategorias as any
    );

    fastify.post('/comprobantes', admin, subirComprobante as any);
    fastify.get('/comprobantes/:id', { ...admin, schema: { params: conId } }, getComprobante as any);

    fastify.get('/personal', { ...admin, schema: { querystring: delCiclo } }, getPersonal as any);
    fastify.post(
        '/personal',
        {
            ...admin,
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['nombre', 'cargo'],
                    properties: {
                        nombre: { type: 'string', maxLength: 120 },
                        cargo: { type: 'string', maxLength: 60 },
                        cedula: { type: ['string', 'null'], maxLength: 20 },
                        notas: { type: ['string', 'null'], maxLength: 300 },
                        seQuedaParaProximosCiclos: { type: 'boolean' },
                    },
                },
            },
        },
        crearPersona as any
    );
    fastify.get('/personal/:id', { ...admin, schema: { params: conId, querystring: delCiclo } }, getPersona as any);
    fastify.put(
        '/personal/:id',
        {
            ...admin,
            schema: {
                params: conId,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        nombre: { type: 'string', maxLength: 120 },
                        cargo: { type: 'string', maxLength: 60 },
                        cedula: { type: ['string', 'null'], maxLength: 20 },
                        notas: { type: ['string', 'null'], maxLength: 300 },
                        activo: { type: 'boolean' },
                        seQuedaParaProximosCiclos: { type: 'boolean' },
                    },
                },
            },
        },
        editarPersona as any
    );
    const acuerdo = {
        monto: { type: ['number', 'string'] },
        frecuencia: { type: 'string', enum: ['UNICO', 'MENSUAL', 'QUINCENAL'] },
        diaDePago: { type: ['integer', 'null'], minimum: 1, maximum: 31 },
        fechaUnica: { type: ['string', 'null'], maxLength: 10 },
        cobraEnVacaciones: { type: ['boolean', 'null'] },
        bonoVacacional: { type: ['number', 'string', 'null'] },
        fechaBono: { type: ['string', 'null'], maxLength: 10 },
    };
    fastify.put(
        '/personal/:id/acuerdo',
        { ...admin, schema: { params: conId, querystring: delCiclo, body: { type: 'object', additionalProperties: false, required: ['monto', 'frecuencia'], properties: acuerdo } } },
        guardarAcuerdo as any
    );
    fastify.put(
        '/nomina',
        {
            ...admin,
            schema: {
                querystring: delCiclo,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        diaDePago: { type: 'integer', minimum: 1, maximum: 31 },
                        mesesDeVacaciones: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 7 } },
                        cobraEnVacaciones: { type: 'boolean' },
                        bonoVacacional: { type: ['number', 'string', 'null'] },
                        fechaBono: { type: ['string', 'null'], maxLength: 10 },
                    },
                },
            },
        },
        guardarNomina as any
    );
    fastify.post(
        '/nomina/a-todos',
        {
            ...admin,
            schema: {
                querystring: delCiclo,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['monto', 'frecuencia', 'personalIds'],
                    properties: { ...acuerdo, personalIds: { type: 'array', maxItems: 500, items: id } },
                },
            },
        },
        aplicarATodos as any
    );

    fastify.post(
        '/personal/:id/pagos',
        {
            ...admin,
            schema: {
                params: conId,
                querystring: delCiclo,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['claves', 'monto', 'metodo', 'fecha'],
                    properties: {
                        claves: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'string', maxLength: 40 } },
                        metodo: { type: 'string', maxLength: 30 },
                        referencia: { type: ['string', 'null'], maxLength: 60 },
                        notas: { type: ['string', 'null'], maxLength: 200 },
                        fecha: { type: 'string', maxLength: 10 },
                        ...dinero,
                    },
                },
            },
        },
        pagarAlPersonal as any
    );
    fastify.post('/pagos-al-personal/:id/anular', { ...admin, schema: { params: conId, body: motivo } }, anularPagoAlPersonal as any);
    // El recibo: el admin, o la persona a la que se le pagó (lo mira el controlador).
    fastify.get('/pagos-al-personal/:id/recibo', { preHandler: [authenticate], schema: { params: conId } }, getReciboDelPersonal as any);

    // Cada quien, lo suyo: el profesor ve SOLO sus pagos.
    fastify.get('/mis-pagos', { preHandler: [authenticate], schema: { querystring: delCiclo } }, getMisPagos as any);
}
