import { invalidateDashboardCache, getRequestInstituteId } from '../academic-years.controller';
import { confirmClose } from '../../services/promotion/confirmar-el-cierre';
import { getPromotionContext as contextoDePromocion, previewStrategyAssignment } from '../../services/promotion/estrategias-de-promocion';
import { FastifyReply, FastifyRequest } from 'fastify';
import * as closeCycleService from '../../services/promotion/close-cycle.service';
import { quienBorra } from '../../utils/papelera';

/** 1. Calcula los RESULTADOS SUGERIDOS por estudiante (no definitivos). */
export const prepareAcademicYearClose = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const prisma = request.tenantPrisma;
    const result = await closeCycleService.prepareClose(prisma, id, getRequestInstituteId(request));
    return reply.status(200).send(result);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al preparar el cierre del ciclo' });
  }
};

/** 2. Confirma la REVISIÓN del admin y ejecuta el cierre (idempotente). */
export const confirmAcademicYearClose = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const prisma = request.tenantPrisma;

    const result = await confirmClose(
      prisma,
      {
        academicYearId: id,
        decisions: body.decisions || [],
        strategyKey: body.strategyKey,
        strategyMode: body.strategyMode,
        nextYearName: body.nextYearName || body.suggestedNextYearName,
        quienCierra: (request.user as any)?.userId ?? (request.user as any)?.id,
      },
      getRequestInstituteId(request),
      quienBorra(request as any)
    );
    await invalidateDashboardCache(request);
    return reply.status(200).send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error?.code === 'CLOSE_ALREADY_EXECUTED') {
      return reply.status(409).send({ error: 'El ciclo ya fue cerrado', code: 'CLOSE_ALREADY_EXECUTED' });
    }
    // Sin año siguiente, un motivo que falta…: se dice cuál y por qué.
    if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code, alumnos: error.alumnos });
    }
    return reply.status(500).send({ error: 'Error al confirmar el cierre del ciclo' });
  }
};

/** Estrategias de asignación de sección disponibles (para la pantalla de revisión). */
export const getCloseStrategies = async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).send({ strategies: closeCycleService.listStrategies() });
};

/** Fase 3.5 Parte 2 — contexto por niveles de la página de promoción. */
export const getPromotionContext = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const context = await contextoDePromocion(
      request.tenantPrisma,
      id,
      getRequestInstituteId(request)
    );
    return reply.status(200).send(context);
  } catch (error) {
    if (error instanceof Error && error.message === 'Academic year not found') {
      return reply.status(404).send({ error: 'Ese año escolar no existe' });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener el contexto de promoción' });
  }
};

/** Fase 3.5 Parte 2 — previsualizar estrategia automática (punto de partida editable). */
export const previewPromotionStrategy = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const result = await previewStrategyAssignment(
      request.tenantPrisma,
      id,
      getRequestInstituteId(request),
      body.strategyKey || 'manual',
      body.strategyMode
    );
    return reply.status(200).send(result);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al aplicar la estrategia' });
  }
};
