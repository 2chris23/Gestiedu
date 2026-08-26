import { FastifyPluginAsync } from 'fastify';
import {
  getEvaluationPlanMetadata,
  upsertEvaluationPlanMetadata,
  getEvaluationPlanRows,
  batchUpsertRows,
  copyPlan,
  getCalendarData,
  batchUpsertActivities,
  parseWordFile,
} from '../controllers/evaluation-plan.controller';
import { authenticate } from '../middleware/auth.middleware';

const evaluationPlanRoutes: FastifyPluginAsync = async (fastify) => {
  // Aplicar middleware a todas las rutas
  fastify.addHook('preValidation', authenticate);

  // Metadatos del Plan
  fastify.get('/metadata', getEvaluationPlanMetadata);
  fastify.post('/metadata', upsertEvaluationPlanMetadata);

  // Filas del Plan (nuevo sistema de bloques)
  fastify.get('/rows', getEvaluationPlanRows);
  fastify.post('/rows/batch', batchUpsertRows);

  // Copiar plan a otras secciones
  fastify.post('/copy', copyPlan);

  // Importar desde Word
  fastify.post('/parse-word', parseWordFile);

  // Datos del calendario
  fastify.get('/calendar-data', getCalendarData);

  // Legacy: mantener compatibilidad
  fastify.post('/activities/batch', batchUpsertActivities);
};

export default evaluationPlanRoutes;
