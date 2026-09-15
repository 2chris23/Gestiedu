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

  // Legacy: mantener compatibilidad
  fastify.post('/activities/batch', batchUpsertActivities);
};

export default evaluationPlanRoutes;
