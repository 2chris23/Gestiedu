import { FastifyPluginAsync } from 'fastify';
import {
  getInstituteConfig,
  updateInstituteConfig,
  uploadLogos,
  updateColors,
  getSubjectPalette,
  addColorToPalette,
  removeColorFromPalette,
  updateColorInPalette,
  getAcademicConfigEndpoint,
  updateAcademicConfigEndpoint
} from '../controllers/institutes.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateCUID } from '../middleware/validation.middleware';
import { platformPrisma } from '../config/database';
import { INSTITUTE_TENANT_SELECT } from '../utils/institute-fields';
import { extractTokenFromHeader, verifyAccessToken } from '../config/jwt';
import { dibujarIconoDelLiceo } from '../services/icono-del-liceo.service';
// Nota: no existen "instituteValidators" en utils/validators; usamos solo schemas JSON locales

const institutesRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createInstituteSchema = {
    body: {
      type: 'object',
      required: ['name', 'code', 'email', 'phone'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 200 },
        code: { type: 'string', minLength: 2, maxLength: 20 },
        description: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        address: { type: 'string' },
        website: { type: 'string', format: 'uri' },
        subdomain: { type: 'string', pattern: '^[a-z0-9-]+$' },
        logo: { type: 'string' },
        colors: {
          type: 'object',
          properties: {
            primary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            secondary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            accent: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
          }
        },
        configuration: { type: 'object' },
        isActive: { type: 'boolean', default: true }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              code: { type: 'string' },
              subdomain: { type: 'string' },
              email: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateInstituteSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 200 },
        description: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        address: { type: 'string' },
        website: { type: 'string', format: 'uri' },
        logo: { type: 'string' },
        colors: {
          type: 'object',
          properties: {
            primary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            secondary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            accent: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
          }
        },
        isActive: { type: 'boolean' }
      }
    }
  };

  const updateConfigSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      additionalProperties: true,
      properties: {
        // Campos básicos del instituto
        name: { type: 'string', minLength: 3, maxLength: 200 },
        code: { type: 'string', minLength: 2, maxLength: 20 },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        address: { type: 'string' },
        website: { type: 'string' },
        description: { type: 'string' },
        timezone: { type: 'string' },
        configuration: { type: ['object', 'string', 'null'] },
        academicConfig: { type: ['object', 'null'] },
        // Configuraciones avanzadas
        academicYear: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            name: { type: 'string' }
          }
        },
        grading: {
          type: 'object',
          properties: {
            scale: { type: 'string', enum: ['0-20', '0-10', '0-100', 'A-F'] },
            passingGrade: { type: 'number' },
            decimalPlaces: { type: 'integer', minimum: 0, maximum: 2 }
          }
        },
        attendance: {
          type: 'object',
          properties: {
            requiredPercentage: { type: 'number', minimum: 0, maximum: 100 },
            lateThresholdMinutes: { type: 'integer', minimum: 0 }
          }
        },
        notifications: {
          type: 'object',
          properties: {
            emailEnabled: { type: 'boolean' },
            smsEnabled: { type: 'boolean' },
            pushEnabled: { type: 'boolean' }
          }
        },
        features: {
          type: 'object',
          properties: {
            reportCards: { type: 'boolean' },
            parentPortal: { type: 'boolean' },
            mobileApp: { type: 'boolean' },
            onlineClasses: { type: 'boolean' }
          }
        }
      }
    }
  };

  const getInstitutesQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        search: { type: 'string' },
        isActive: { type: 'boolean' }
      }
    }
  };

  // ─── RUTA PÚBLICA: info básica del instituto por slug ───────────────────────
  // Usada por el frontend (login, layout) para obtener nombre y branding sin auth.
  // Consulta la Platform DB (platformPrisma), no la BD del tenant.
  fastify.get('/public/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try {
      // Importar platformPrisma directamente (no confiar en request.server.platformPrisma)
      const institute = await platformPrisma.institute.findFirst({
        where: {
          OR: [
            { slug },
            { subdomain: slug },
          ]
        },
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          status: true,
          logo: true,
          favicon: true,
          primaryColor: true,
          secondaryColor: true,
        },
      });

      if (!institute) {
        return reply.status(404).send({ error: 'Instituto no encontrado' });
      }

      // Solo rechazar si está explícitamente suspendido o inactivo
      if (institute.status === 'SUSPENDED' || institute.status === 'INACTIVE') {
        return reply.status(503).send({
          error: 'Instituto no disponible',
          status: institute.status,
        });
      }

      return reply.send({
        id: institute.id,
        name: institute.name,
        slug: institute.slug,
        subdomain: institute.subdomain,
        status: institute.status,
        logo: institute.logo,
        favicon: institute.favicon,
        primaryColor: institute.primaryColor,
        secondaryColor: institute.secondaryColor,
      });
    } catch (error) {
      request.log.error({ error }, 'Error en GET /institutes/public/:slug');
      return reply.status(500).send({ error: 'Error interno del servidor' });
    }
  });

  // ========================================
  // RUTAS /current/* — deben ir ANTES de /:id/* para que Fastify no las capture como parámetro
  // ========================================

  /**
   * LA FICHA DEL LICEO — LO DE LA PORTADA Y LO DE ADENTRO
   *
   * ─── LO QUE PASABA ─────────────────────────────────────────────────────────
   *
   * Esta ruta era pública entera. Con solo saber el nombre corto del liceo —que
   * es público, va en la dirección de internet— y **sin ninguna credencial**,
   * cualquiera recibía:
   *
   *   el correo y el teléfono de la dirección, la dirección física, la
   *   configuración académica completa (nota mínima para aprobar, cuántas
   *   materias se pueden arrastrar), el plan contratado, el precio mensual, el
   *   estado de pago, la próxima fecha de cobro, cuántos alumnos y profesores
   *   tiene y cuánto espacio ocupa.
   *
   * Comprobado contra el servidor en marcha: una sola llamada, sin entrar.
   *
   * Y además decidía de qué liceo hablar leyendo el token **sin comprobar la
   * firma** (`decodeToken`), que es exactamente el mismo fallo que ya se había
   * encontrado en la copia guardada de respuestas.
   *
   * ─── LO QUE SE HACE AHORA ──────────────────────────────────────────────────
   *
   * Se separa lo que necesita la portada de lo que es de la casa:
   *
   *   · SIN sesión → solo lo que hace falta para pintar la pantalla de entrar:
   *     nombre, logo, ícono, colores y si el liceo está activo. Eso mismo ya lo
   *     entrega `/api/institutes/public/:slug` a quien sepa el nombre corto, así
   *     que no se regala nada nuevo.
   *   · CON sesión comprobada → la ficha completa, y solo la de SU liceo: el
   *     instituto sale de `request.institute`, que lo resolvió `identifyTenant`
   *     a partir del token ya verificado. Si alguien nombra otro liceo, ese
   *     middleware ya corta con TENANT_MISMATCH.
   *
   * La cabecera con el nombre corto sigue valiendo para la portada (hace falta:
   * antes de entrar no hay token que diga qué liceo es), pero ya no abre la
   * ficha completa de nadie.
   */

  /** Lo que se puede enseñar antes de entrar: lo justo para pintar la portada. */
  const DE_LA_PORTADA = [
    'id',
    'name',
    'slug',
    'subdomain',
    'status',
    'logo',
    'favicon',
    'primaryColor',
    'secondaryColor',
    'timezone',
  ] as const;

  /**
   * EL ICONO DE LA APP DEL LICEO
   *
   * Lo pide el teléfono al instalar la aplicación, y lo pide SIN SESIÓN: quien
   * la instala todavía no ha entrado. Se enseña lo mismo que la portada —el
   * logo, que ya es público—, solo que recortado en cuadrado para que el
   * teléfono no lo deforme ni le coma los bordes.
   */
  fastify.get('/current/icono', async (request, reply) => {
    const { tam, liceo } = request.query as { tam?: string; liceo?: string };
    const tamano = Number(tam) === 192 ? 192 : 512;
    // El teléfono pide el icono a pelo, sin cabeceras nuestras: por eso el
    // liceo también puede venir en la dirección.
    const slug = liceo || (request.headers['x-institute-slug'] as string) || '';

    if (!slug) return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });

    const institute = await platformPrisma.institute.findFirst({
      where: { OR: [{ slug }, { subdomain: slug }] },
      select: { logo: true, primaryColor: true },
    });
    if (!institute) return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });

    try {
      const { data, version } = await dibujarIconoDelLiceo(institute.logo, institute.primaryColor, tamano);
      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=86400')
        .header('ETag', `"${version}"`)
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(data);
    } catch (error: any) {
      // Sin logo propio no es un fallo: el teléfono se queda con el icono de la
      // plataforma, que va en el manifest justo antes que este.
      if (error?.code === 'ICON_NOT_AVAILABLE') {
        return reply.status(404).send({ success: false, message: error.message });
      }
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'No se pudo dibujar el icono' });
    }
  });

  fastify.get('/current/config', async (request, reply) => {
    try {
      // `identifyTenant` ya resolvió el instituto a partir del token COMPROBADO.
      // Si hay sesión válida, esto es su liceo y ningún otro.
      const sesionComprobada = await (async () => {
        const token = extractTokenFromHeader(request.headers.authorization);
        if (!token) return false;
        try {
          verifyAccessToken(token);
          return true;
        } catch {
          return false;
        }
      })();

      const slug = (request.headers['x-institute-slug'] as string) || '';
      const instituteId = sesionComprobada ? (request as any).institute?.id : null;

      const institute = await platformPrisma.institute.findFirst({
        where: instituteId
          ? { id: instituteId }
          : slug
          ? { OR: [{ slug }, { subdomain: slug }] }
          : undefined,
        select: INSTITUTE_TENANT_SELECT,
      });

      if (!institute) {
        return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });
      }

      if (!sesionComprobada) {
        const portada: Record<string, unknown> = {};
        for (const campo of DE_LA_PORTADA) portada[campo] = (institute as any)[campo];
        return reply.send({ success: true, data: portada });
      }

      return reply.send({
        success: true,
        data: {
          ...institute,
          configuration: institute.academicConfig ? JSON.stringify(institute.academicConfig) : null,
        }
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Error al obtener configuración del instituto' });
    }
  });

  // Ruta para obtener el instituto actual del usuario (requiere autenticación)
  fastify.get('/current/info', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const instituteId = request.user?.instituteId;
    if (!instituteId) {
      return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });
    }
    request.params = { id: instituteId } as any;
    return getInstituteConfig(request, reply);
  });

  // Ruta autenticada para obtener configuración completa
  fastify.get('/current/config/full', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const instituteId = request.user?.instituteId;
    if (!instituteId) {
      return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });
    }
    request.params = { id: instituteId };
    return getInstituteConfig(request, reply);
  });

  // Fase 3.5-C — Configuración académica del liceo (reglas de promoción)
  fastify.get('/current/academic-config', {
    preHandler: [authenticate]
  }, getAcademicConfigEndpoint);

  fastify.put('/current/academic-config', {
    preHandler: [authenticate, requireAdmin]
  }, updateAcademicConfigEndpoint);

  // Actualizar configuración del instituto actual
  fastify.put('/current/config', {
    schema: { body: updateConfigSchema.body },
    preHandler: [authenticate, requireAdmin]
  }, async (request, reply) => {
    const instituteId = request.user?.instituteId;
    if (!instituteId) {
      return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });
    }
    request.params = { id: instituteId };
    return updateInstituteConfig(request, reply);
  });

  // ========================================
  // RUTAS /:id/* — dinámicas, deben ir DESPUÉS de las estáticas
  // ========================================

  fastify.get('/:id/config', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, getInstituteConfig);

  fastify.put('/:id/config', {
    schema: updateConfigSchema,
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, updateInstituteConfig);

  // Upload de logo (DEPRECATED - usar /logos en su lugar)
  // fastify.post('/:id/logo', {
  //   schema: {
  //     params: {
  //       type: 'object',
  //       required: ['id'],
  //       properties: {
  //         id: { type: 'string' }
  //       }
  //     }
  //   },
  //   preHandler: [authenticate, requireAdmin, validateCUID('id')]
  // }, uploadLogos);

  // (rutas /current/* ya registradas arriba)

  // ========================================
  // NUEVAS RUTAS: Logos, Colores y Paleta
  // ========================================

  // Subir logos (favicon y logo principal)
  fastify.post('/logos', {
    preHandler: [authenticate, requireAdmin]
  }, uploadLogos);

  // Actualizar colores del sistema
  fastify.patch('/colors', {
    schema: {
      body: {
        type: 'object',
        required: ['primaryColor', 'secondaryColor'],
        properties: {
          primaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          secondaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, updateColors);

  // Obtener paleta de colores para materias
  fastify.get('/subject-palette', {
    preHandler: [authenticate]
  }, getSubjectPalette);

  // Agregar color a la paleta
  fastify.post('/subject-palette', {
    schema: {
      body: {
        type: 'object',
        required: ['color'],
        properties: {
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, addColorToPalette);

  // Eliminar color de la paleta
  fastify.delete('/subject-palette/:index', {
    schema: {
      params: {
        type: 'object',
        required: ['index'],
        properties: {
          index: { type: 'string', pattern: '^[0-9]+$' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, removeColorFromPalette);

  // Actualizar color en la paleta
  fastify.patch('/subject-palette/:index', {
    schema: {
      params: {
        type: 'object',
        required: ['index'],
        properties: {
          index: { type: 'string', pattern: '^[0-9]+$' }
        }
      },
      body: {
        type: 'object',
        required: ['color'],
        properties: {
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, updateColorInPalette);
};

export default institutesRoutes;
export { institutesRoutes };
