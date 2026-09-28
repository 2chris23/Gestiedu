import { FastifyPluginAsync } from 'fastify';
import {
  getEvaluationPlanMetadata,
  upsertEvaluationPlanMetadata,
  getEvaluationPlanRows,
  batchUpsertRows,
  copyPlan,
  getCopyTargets,
  getCalendarData,
  batchUpsertActivities,
  parseWordFile,
} from '../controllers/evaluation-plan.controller';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { instrumentoDeLaFila, guardarInstrumento, borrarInstrumento } from '../services/instrumentos.service';
import { responderErrorClaro } from '../utils/error-claro';
import { quienBorra } from '../utils/papelera';
import { actaDeSocializacion, instrumentosDelLapso } from '../services/papeles-del-plan.service';
import { assertClassroomScope } from '../services/authorization.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';

type DelPlan = { Querystring: { classroomId: string; subjectId: string; lapso: string; conNotas?: string } };
const delPlan = {
  type: 'object',
  required: ['classroomId', 'subjectId', 'lapso'],
  properties: {
    classroomId: { type: 'string', minLength: 1, maxLength: 64 },
    subjectId: { type: 'string', minLength: 1, maxLength: 64 },
    lapso: { type: 'string', enum: ['1', '2', '3'] },
    conNotas: { type: 'string' },
  },
};
/** Los papeles del plan los ve quien planifica esa materia en esa sección (o el admin). */
const suPlan = async (r: any) => assertClassroomScope(r.tenantPrisma, r.user, r.query.classroomId, { subjectId: r.query.subjectId, accion: 'ver el plan' });

type ConFila = { Params: { rowId: string }; Body: any };
const fila = { type: 'object', required: ['rowId'], properties: { rowId: { type: 'string', minLength: 1, maxLength: 64 } } };
const responder = (fn: (r: any) => Promise<unknown>) => async (r: any, reply: any) => {
  try {
    return reply.send({ success: true, data: await fn(r) });
  } catch (e) {
    return responderErrorClaro(reply, e);
  }
};

const evaluationPlanRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Va en `onRequest`, como en el resto de las rutas.
   *
   * Estaba en `preValidation`, que corre más tarde. Desde que los guardias se
   * adelantan (`middleware/guardias.ts`), `requireTeacher` de `/parse-word`
   * corría ANTES que este `authenticate` y no encontraba a nadie identificado:
   * subir un Word respondía 401 aunque lo hiciera un profesor. Lo cazó la tanda
   * completa de pruebas (RES-API-09 y RES-API-10).
   *
   * Preguntar quién eres no necesita leer el archivo, así que su sitio es el
   * mismo que en las demás rutas: lo primero de todo.
   */
  fastify.addHook('onRequest', authenticate);

  // Metadatos del Plan
  fastify.get('/metadata', getEvaluationPlanMetadata);
  fastify.post('/metadata', upsertEvaluationPlanMetadata);

  // Filas del Plan (nuevo sistema de bloques)
  fastify.get('/rows', getEvaluationPlanRows);
  fastify.post('/rows/batch', batchUpsertRows);

  // Copiar plan a otras secciones
  fastify.get('/copy-targets', getCopyTargets);
  fastify.post('/copy', copyPlan);

  // Importar desde Word. Subir un archivo es escribir: el alumno no sube nada,
  // ni siquiera para que se lo lean.
  fastify.post('/parse-word', { preHandler: [requireTeacher] }, parseWordFile);

  // Datos del calendario
  fastify.get('/calendar-data', getCalendarData);

  // El instrumento de una evaluación del plan (`services/instrumentos.service.ts`).
  // Lo ve y lo cambia quien planifica esa materia en esa sección (o el admin).
  fastify.get<ConFila>('/rows/:rowId/instrumento', { preHandler: [requireTeacher], schema: { params: fila } }, responder((r) => instrumentoDeLaFila(r.tenantPrisma, r.user, r.params.rowId)));
  fastify.put<ConFila>(
    '/rows/:rowId/instrumento',
    {
      preHandler: [requireTeacher],
      schema: {
        params: fila,
        body: { type: 'object', required: ['definicion'], properties: { definicion: { type: 'object' }, version: { type: ['integer', 'null'] } } },
      },
    },
    responder((r) => guardarInstrumento(r.tenantPrisma, r.user, r.params.rowId, r.body))
  );
  fastify.delete<ConFila>('/rows/:rowId/instrumento', { preHandler: [requireTeacher], schema: { params: fila } }, responder((r) => borrarInstrumento(r.tenantPrisma, r.user, r.params.rowId, quienBorra(r))));

  // Los papeles del plan (`services/papeles-del-plan.service.ts`).
  fastify.get<DelPlan>(
    '/acta-de-socializacion',
    { preHandler: [requireTeacher], schema: { querystring: delPlan } },
    responder(async (r) => {
      await suPlan(r);
      const hoy = todayInTimezone(await instituteTimezone(r.tenantPrisma));
      return actaDeSocializacion(r.tenantPrisma, String(r.user?.instituteId ?? ''), r.query.classroomId, r.query.subjectId, r.query.lapso, hoy);
    })
  );
  fastify.get<DelPlan>(
    '/instrumentos-del-lapso',
    { preHandler: [requireTeacher], schema: { querystring: delPlan } },
    responder(async (r) => {
      await suPlan(r);
      return instrumentosDelLapso(r.tenantPrisma, r.query.classroomId, r.query.subjectId, r.query.lapso, r.query.conNotas === '1');
    })
  );

  // Legacy: mantener compatibilidad
  fastify.post('/activities/batch', batchUpsertActivities);
};

export default evaluationPlanRoutes;
