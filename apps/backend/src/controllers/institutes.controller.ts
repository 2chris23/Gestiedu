/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { InstitutesService } from '../services/institutes.service';
import { SUCCESS_MESSAGES } from '../utils/constants';
import { getAcademicConfig, updateAcademicConfig, esAsistenciaMinimaValida, esRedondeoValido } from '../services/promotion/close-cycle.service';
import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';
import { platformPrisma } from '../config/database';
import { revisarImagen } from '../utils/archivos-que-se-aceptan';
import { guardarArchivoDelLiceo } from '../services/archivos-del-liceo.service';
import { limpiarDatosDeDocumentos } from '../services/constancias.service';
import { revisarDatosDelPlantel, membreteDelLiceo } from '../services/datos-del-plantel.service';
import { esListaDeApreciaciones } from '../services/apreciaciones.service';
import { esReglasDeRevision, esUltimoAnoConPendientes, esPendienteNoAprobada, esReglasDePendientes } from '../services/promotion/reglas-del-fin-de-ano';
import {
  erroresDelHorario,
  franjasDelTurno,
  horarioParaGuardar,
  type HorarioDelLiceo,
} from '../utils/franjas-del-horario';

/**
 * Las clases del horario que caben en la rejilla de antes y dejarían de caber
 * en la nueva. Las que ya estaban fuera no cuentan: si no, guardar cualquier
 * otra cosa de la configuración pediría confirmar siempre.
 */
async function clasesQueSeQuedanFuera(
  prisma: any,
  antes: HorarioDelLiceo | undefined,
  despues: HorarioDelLiceo
): Promise<number> {
  const bloques: Array<{ startTime: string; endTime: string; classroom: { shift: string | null } | null }> =
    await prisma.scheduleBlock.findMany({
      where: {
        blockType: 'CLASS',
        classroomId: { not: null },
        classroom: { academicYear: { status: { not: 'COMPLETED' } } },
      },
      select: { startTime: true, endTime: true, classroom: { select: { shift: true } } },
    });
  const cabe = (h: HorarioDelLiceo | undefined, turno: string | null | undefined, b: { startTime: string; endTime: string }) =>
    franjasDelTurno(h, turno).some((f) => f.type === 'class' && f.startTime === b.startTime && f.endTime === b.endTime);
  return bloques.filter((b) => cabe(antes, b.classroom?.shift, b) && !cabe(despues, b.classroom?.shift, b)).length;
}

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
      data: {
        ...config,
        configuration: config?.academicConfig ? JSON.stringify(config.academicConfig) : null
      }
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

    // Validar formato seguro para logo si se envía (mitigación path traversal)
    let sanitizedLogo = data.logo;
    if (sanitizedLogo !== undefined && sanitizedLogo !== null) {
      if (typeof sanitizedLogo !== 'string' || sanitizedLogo.includes('..') || sanitizedLogo.includes('\0')) {
        return reply.status(400).send({ error: 'Ruta de logo no válida', code: 'INVALID_LOGO_PATH' });
      }
      const isAllowedPattern = /^\/uploads\/[a-zA-Z0-9_\-\/.]+\.(png|jpg|jpeg|svg|webp|ico)$/i.test(sanitizedLogo) ||
                               /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]*)?$/i.test(sanitizedLogo);
      if (!isAllowedPattern) {
        return reply.status(400).send({ error: 'Formato o protocolo de ruta de logo no permitido', code: 'INVALID_LOGO_FORMAT' });
      }
    }

    // Campos directos del modelo Institute
    const allowedFields: any = {
      name: data.name,
      code: data.code,
      logo: sanitizedLogo,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      description: data.description,
      timezone: data.timezone,
    };

    // Procesar configuraciones académicas, notificaciones y seguridad
    const currentInstitute = await platformPrisma.institute.findUnique({
      where: { id: instituteId },
      select: { academicConfig: true, timezone: true }
    });

    const currentAcademicConfig = (currentInstitute?.academicConfig as any) || {};
    let nextAcademicConfig = { ...currentAcademicConfig };
    let hasAcademicChanges = false;
    // El horario del liceo se mira aparte: tiene que cuadrar (ver abajo).
    let horarioPedido: HorarioDelLiceo | undefined;
    let confirmarClasesFuera = data.confirmarClasesFuera === true;

    // Manejar payload `configuration` (usado por AcademicSettings, NotificationSettings y SecuritySettings)
    if (data.configuration !== undefined) {
      const configObj = typeof data.configuration === 'string'
        ? JSON.parse(data.configuration)
        : data.configuration;

      if (configObj && typeof configObj === 'object') {
        hasAcademicChanges = true;
        if (configObj.timezone && !allowedFields.timezone) {
          allowedFields.timezone = configObj.timezone;
        }
        if (configObj.gradeScale) nextAcademicConfig.gradeScale = configObj.gradeScale;
        if (configObj.passingGrade !== undefined) {
          nextAcademicConfig.passingGrade = Number(configObj.passingGrade);
          nextAcademicConfig.notaMinimaAprobatoria = Number(configObj.passingGrade);
        }
        // Desde qué porcentaje se le avisa al representante que su hijo falta.
        // Fuera de 0–100 se ignora y se queda el que había.
        if (esAsistenciaMinimaValida(Number(configObj.asistenciaMinima))) {
          nextAcademicConfig.asistenciaMinima = Number(configObj.asistenciaMinima);
        }
        if (esRedondeoValido(configObj.redondeoDeDefinitivas)) {
          nextAcademicConfig.redondeoDeDefinitivas = configObj.redondeoDeDefinitivas;
        }
        // Quién firma las constancias y el código del plantel. Solo los
        // campos conocidos, como texto (`limpiarDatosDeDocumentos`).
        /**
         * Quién firma y los datos oficiales del plantel (DEA, estadístico,
         * dependencia, zona, entidad…). Se MEZCLAN con lo guardado: la
         * pantalla de General manda los del plantel y la de Académico los de
         * la firma, y antes cada una borraba lo de la otra. Un campo que viene
         * vacío se borra; uno que no viene, se queda.
         */
        if (configObj.documentos !== undefined) {
          const entrada = (configObj.documentos && typeof configObj.documentos === 'object' ? configObj.documentos : {}) as Record<string, unknown>;
          const { datos, errores } = revisarDatosDelPlantel(entrada);
          if (errores.length) {
            return reply.status(400).send({ error: errores[0], code: 'DATOS_DEL_PLANTEL', errores });
          }
          const firma = limpiarDatosDeDocumentos(entrada);
          const documentos: Record<string, unknown> = { ...(currentAcademicConfig.documentos ?? {}) };
          for (const campo of ['firmanteNombre', 'firmanteCedula', 'firmanteCargo'] as const) {
            if (!(campo in entrada)) continue;
            if (firma[campo]) documentos[campo] = firma[campo];
            else delete documentos[campo];
          }
          for (const [campo, valor] of Object.entries(datos)) {
            if (valor) documentos[campo] = valor;
            else delete documentos[campo];
          }
          nextAcademicConfig.documentos = documentos;
        }
        // Las palabras de las materias con apreciación (`apreciaciones.service`).
        if (configObj.apreciaciones !== undefined) {
          if (!esListaDeApreciaciones(configObj.apreciaciones)) {
            return reply.status(400).send({
              error: 'Las apreciaciones son de 2 a 10 palabras distintas, de hasta 40 letras cada una.',
              code: 'APRECIACIONES_INVALIDAS',
            });
          }
          nextAcademicConfig.apreciaciones = configObj.apreciaciones.map((v: string) => v.trim());
        }
        if (configObj.schedule) horarioPedido = configObj.schedule;
        if (configObj.confirmarClasesFuera === true) confirmarClasesFuera = true;
        if (configObj.language) nextAcademicConfig.language = configObj.language;
        if (configObj.dateFormat) nextAcademicConfig.dateFormat = configObj.dateFormat;
        if (configObj.notifications) nextAcademicConfig.notifications = configObj.notifications;
        if (configObj.security) nextAcademicConfig.security = configObj.security;
      }
    }

    // Manejar payload `academicConfig` directo
    if (data.academicConfig && typeof data.academicConfig === 'object') {
      hasAcademicChanges = true;
      const { schedule: horarioDirecto, ...resto } = data.academicConfig;
      if (horarioDirecto) horarioPedido = horarioDirecto;
      nextAcademicConfig = { ...nextAcademicConfig, ...resto };
      if (data.academicConfig.notaMinimaAprobatoria !== undefined) {
        nextAcademicConfig.passingGrade = Number(data.academicConfig.notaMinimaAprobatoria);
      }
      if (data.academicConfig.passingGrade !== undefined) {
        nextAcademicConfig.notaMinimaAprobatoria = Number(data.academicConfig.passingGrade);
      }
    }

    /**
     * EL HORARIO TIENE QUE CUADRAR
     *
     * El admin pone por turno el inicio, el fin, la duración de la clase y los
     * recreos; las horas las cuenta el sistema. Si sobran o faltan minutos no
     * se guarda: se dice cuánto y a qué hora tendría que acabar
     * (`utils/franjas-del-horario.ts`). Antes se guardaba cualquier cosa.
     *
     * Y si hay clases puestas en el horario que dejarían de caer en una hora
     * del día, se pregunta antes (409): se quedarían fuera de la rejilla, sin
     * que ninguna pantalla las enseñe.
     */
    if (horarioPedido !== undefined) {
      if (!horarioPedido || typeof horarioPedido !== 'object') {
        return reply.status(400).send({ error: 'El horario no es válido', code: 'HORARIO_NO_CUADRA', errores: [] });
      }
      const errores = erroresDelHorario(horarioPedido);
      if (errores.length) {
        return reply.status(400).send({ error: errores[0], code: 'HORARIO_NO_CUADRA', errores });
      }
      const horario = horarioParaGuardar(horarioPedido);
      if (!confirmarClasesFuera) {
        const fuera = await clasesQueSeQuedanFuera(request.tenantPrisma, currentAcademicConfig.schedule, horario);
        if (fuera > 0) {
          return reply.status(409).send({
            error:
              fuera === 1
                ? 'Hay 1 clase del horario que ya no caería en ninguna hora del día.'
                : `Hay ${fuera} clases del horario que ya no caerían en ninguna hora del día.`,
            code: 'HORARIO_DEJA_CLASES_FUERA',
            cuantas: fuera,
          });
        }
      }
      nextAcademicConfig.schedule = horario;
      hasAcademicChanges = true;
    }

    if (hasAcademicChanges) {
      allowedFields.academicConfig = nextAcademicConfig;
    }

    // Filtrar solo los campos que se enviaron
    const updateData = Object.fromEntries(
      Object.entries(allowedFields).filter(([_, value]) => value !== undefined)
    );

    const config = await institutesService.updateInstituteConfig(instituteId, updateData, userId, request.tenantPrisma);

    // Invalidar caché Redis
    await conLiceo(instituteId, () => RedisCache.delete(`dashboard:admin:${instituteId}`));

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: {
        ...config,
        configuration: config.academicConfig ? JSON.stringify(config.academicConfig) : null
      }
    });
  } catch (error) {
    throw error;
  }
}


/**
 * El membrete de los documentos del liceo: el texto del ministerio, el nombre
 * oficial, los códigos (DEA, estadístico, dependencia), la zona, la entidad,
 * el municipio, la dirección y el logo. Lo usa toda hoja que se imprime.
 */
export async function obtenerMembrete(request: FastifyRequest, reply: FastifyReply) {
  const instituteId = getInstId(request);
  return reply.status(200).send({ success: true, data: await membreteDelLiceo(instituteId) });
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

        // SE MIRA QUÉ ES, NO CÓMO SE LLAMA
        //
        // Antes la extensión salía del nombre que mandaba el usuario y el archivo
        // se escribía tal cual. Como esta carpeta se sirve públicamente, con eso
        // se podía dejar una página HTML colgada en el dominio del sistema.
        // Ahora se miran los primeros bytes, que son los que de verdad dicen qué
        // es. Ver `utils/archivos-que-se-aceptan.ts`.
        const veredicto = revisarImagen(buffer, filename);
        if (!veredicto.aceptada) {
            return reply.status(400).send({
                error: veredicto.motivo,
                code: 'ARCHIVO_NO_ACEPTADO',
            });
        }

        if (fieldname !== 'favicon' && fieldname !== 'logo') continue;

        // En la base de la plataforma, no en el disco de este proceso: así lo
        // ven todos los procesos y entra en el respaldo. La extensión es la
        // que le toca por su contenido, no la que traía. El anterior no se
        // borra: se queda como estaba (nada se borra de verdad).
        const direccion = await guardarArchivoDelLiceo(instituteId, fieldname, buffer, veredicto.extension!);

        if (fieldname === 'favicon') {
          results.favicon = await institutesService.uploadFavicon(instituteId, direccion, userId, request.tenantPrisma);
        } else {
          results.logo = await institutesService.uploadLogo(instituteId, direccion, userId, request.tenantPrisma);
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
    // Un porcentaje fuera de 0–100 no se guarda: se queda el que había.
    if (esAsistenciaMinimaValida(body.asistenciaMinima)) patch.asistenciaMinima = body.asistenciaMinima;
    // 'MPPE' o 'NINGUNO'; cualquier otra cosa se ignora y se queda la que había.
    if (esRedondeoValido(body.redondeoDeDefinitivas)) patch.redondeoDeDefinitivas = body.redondeoDeDefinitivas;
    // La lista de apreciaciones: de 2 a 10 palabras distintas. Una lista mal
    // hecha se rechaza (no se ignora): dejaría materias sin cómo evaluarse.
    if (body.apreciaciones !== undefined) {
      if (!esListaDeApreciaciones(body.apreciaciones)) {
        return reply.status(400).send({
          error: 'Las apreciaciones son de 2 a 10 palabras distintas, de hasta 40 letras cada una.',
          code: 'APRECIACIONES_INVALIDAS',
        });
      }
      patch.apreciaciones = body.apreciaciones;
    }
    // Las reglas del fin del año (`reglas-del-fin-de-ano.ts`). Mal hechas, se
    // rechazan con el motivo: dejarían el cierre sin saber qué hacer.
    const mal = (error: string, code: string) => reply.status(400).send({ error, code });
    if (body.revision !== undefined) {
      if (!esReglasDeRevision(body.revision)) {
        return mal('La revisión: de 1 a 6 partes con nombre distinto, pesos enteros que suman 100, y un tope de 1 a 20 materias o ninguno.', 'REVISION_INVALIDA');
      }
      patch.revision = body.revision;
    }
    if (body.ultimoAnoConPendientes !== undefined) {
      if (!esUltimoAnoConPendientes(body.ultimoAnoConPendientes)) return mal('Último año con pendientes: REPITE, SOLO_PENDIENTES o EGRESA.', 'REGLA_INVALIDA');
      patch.ultimoAnoConPendientes = body.ultimoAnoConPendientes;
    }
    if (body.pendienteNoAprobada !== undefined) {
      if (!esPendienteNoAprobada(body.pendienteNoAprobada)) return mal('Pendiente no aprobada: REPITE o SIGUE_PENDIENTE.', 'REGLA_INVALIDA');
      patch.pendienteNoAprobada = body.pendienteNoAprobada;
    }
    if (body.pendientes !== undefined) {
      if (!esReglasDePendientes(body.pendientes)) return mal('Materias pendientes: de 1 a 8 momentos, y MOMENTO_APROBADO o PROMEDIO.', 'REGLA_INVALIDA');
      patch.pendientes = body.pendientes;
    }
    const instId = getInstId(request);
    const config = await updateAcademicConfig(instId, patch);
    await conLiceo(instId, () => RedisCache.delete(`dashboard:admin:${instId}`));
    return reply.status(200).send({ success: true, data: config });
  } catch (error) {
    throw error;
  }
}
