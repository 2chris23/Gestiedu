/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { InstitutesService } from '../services/institutes.service';
import { SUCCESS_MESSAGES } from '../utils/constants';
import { deleteOldFile } from '../middleware/upload.middleware';
import { getAcademicConfig, updateAcademicConfig } from '../services/promotion/close-cycle.service';
import path from 'path';
import fs from 'fs';

const institutesService = new InstitutesService();

// Helper to get instituteId from request.
// SEGURIDAD: No hay fallback a un string hardcodeado. Si el instituteId
// no está resuelto, la request falla (fail-closed).
function getInstId(request: FastifyRequest): string {
  const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
  if (!instituteId) {
    throw new Error('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return instituteId;
}

// Obtener configuración del instituto
export async function getInstituteConfig(request: FastifyRequest, reply: FastifyReply) {
  try {
    const config = await institutesService.getInstituteConfig(getInstId(request));

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: config
    });
  } catch (error) {
    throw error;
  }
}

// Actualizar configuración del instituto (solo administradores)
export async function updateInstituteConfig(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = request.body as any;
    const userId = request.user?.userId!;
    const instituteId = getInstId(request);

    // Validar que solo se puedan actualizar campos permitidos
    const allowedFields = {
      name: data.name,
      code: data.code,
      logo: data.logo,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      description: data.description
    };

    // Filtrar solo los campos que se enviaron
    const updateData = Object.fromEntries(
      Object.entries(allowedFields).filter(([_, value]) => value !== undefined)
    );

    const config = await institutesService.updateInstituteConfig(instituteId, updateData, userId, request.tenantPrisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: config
    });
  } catch (error) {
    throw error;
  }
}


// Subir logos del instituto (favicon y logo principal)
export async function uploadLogos(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = request.user?.userId!;
    const instituteId = getInstId(request);
    const currentInstitute = await institutesService.getInstitute(instituteId);
    const results: any = {};

    // Procesar archivos multipart
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file') {
        const fieldname = part.fieldname;
        const filename = part.filename;
        const buffer = await part.toBuffer();

        // Determinar la carpeta según el tipo de archivo
        const folder = fieldname === 'favicon' ? 'favicon' : 'logos';
        const uploadDir = path.join(process.cwd(), 'uploads', 'institute', folder);

        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generar nombre único para el archivo
        const ext = path.extname(filename);
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        const filepath = path.join(uploadDir, uniqueFilename);

        // Guardar archivo
        fs.writeFileSync(filepath, buffer);

        // Ruta relativa para guardar en BD
        const relativePath = `/uploads/institute/${folder}/${uniqueFilename}`;

        // Actualizar según el tipo
        if (fieldname === 'favicon') {
          // Eliminar favicon anterior si existe
          if (currentInstitute?.favicon) {
            deleteOldFile(currentInstitute.favicon);
          }
          results.favicon = await institutesService.uploadFavicon(instituteId, relativePath, userId, request.tenantPrisma);
        } else if (fieldname === 'logo') {
          // Eliminar logo anterior si existe
          if (currentInstitute?.logo) {
            deleteOldFile(currentInstitute.logo);
          }
          results.logo = await institutesService.uploadLogo(instituteId, relativePath, userId, request.tenantPrisma);
        }
      }
    }

    return reply.status(200).send({
      success: true,
      message: 'Logos actualizados exitosamente',
      data: results
    });
  } catch (error) {
    throw error;
  }
}

// Actualizar colores del sistema
export async function updateColors(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { primaryColor, secondaryColor } = request.body as { primaryColor: string; secondaryColor: string };
    const userId = request.user?.userId!;

    const colors = await institutesService.updateColors(getInstId(request), primaryColor, secondaryColor, userId, request.tenantPrisma);

    return reply.status(200).send({
      success: true,
      message: 'Colores actualizados exitosamente',
      data: colors
    });
  } catch (error) {
    throw error;
  }
}

// Obtener paleta de colores para materias
export async function getSubjectPalette(request: FastifyRequest, reply: FastifyReply) {
  try {
    const palette = await institutesService.getSubjectPalette(getInstId(request));

    return reply.status(200).send({
      success: true,
      data: palette
    });
  } catch (error) {
    throw error;
  }
}

// Agregar color a la paleta
export async function addColorToPalette(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { color } = request.body as { color: string };
    const userId = request.user?.userId!;

    const palette = await institutesService.addColorToPalette(getInstId(request), color, userId, request.tenantPrisma);

    return reply.status(200).send({
      success: true,
      message: 'Color agregado a la paleta',
      data: palette
    });
  } catch (error) {
    throw error;
  }
}

// Eliminar color de la paleta
export async function removeColorFromPalette(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { index } = request.params as { index: string };
    const userId = request.user?.userId!;

    const palette = await institutesService.removeColorFromPalette(getInstId(request), parseInt(index), userId, request.tenantPrisma);

    return reply.status(200).send({
      success: true,
      message: 'Color eliminado de la paleta',
      data: palette
    });
  } catch (error) {
    throw error;
  }
}

// Actualizar color en la paleta
export async function updateColorInPalette(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { index } = request.params as { index: string };
    const { color } = request.body as { color: string };
    const userId = request.user?.userId!;

    const palette = await institutesService.updateColorInPalette(getInstId(request), parseInt(index), color, userId, request.tenantPrisma);

    return reply.status(200).send({
      success: true,
      message: 'Color actualizado en la paleta',
      data: palette
    });
  } catch (error) {
    throw error;
  }
}

// ============================================================
// Fase 3.5-C — Configuración académica del liceo (reglas de promoción)
// ============================================================

export async function getAcademicConfigEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const config = await getAcademicConfig(getInstId(request));
    return reply.status(200).send({ success: true, data: config });
  } catch (error) {
    throw error;
  }
}

export async function updateAcademicConfigEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as any;
    const patch: any = {};
    if (typeof body.notaMinimaAprobatoria === 'number') patch.notaMinimaAprobatoria = body.notaMinimaAprobatoria;
    if (typeof body.maxMateriasPendientesParaPromover === 'number') patch.maxMateriasPendientesParaPromover = body.maxMateriasPendientesParaPromover;
    if (typeof body.permitePendientesEnUltimoAno === 'boolean') patch.permitePendientesEnUltimoAno = body.permitePendientesEnUltimoAno;
    const config = await updateAcademicConfig(getInstId(request), patch);
    return reply.status(200).send({ success: true, data: config });
  } catch (error) {
    throw error;
  }
}
