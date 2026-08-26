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
      properties: {
        // Campos básicos del instituto
        name: { type: 'string', minLength: 3, maxLength: 200 },
        code: { type: 'string', minLength: 2, maxLength: 20 },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        address: { type: 'string' },
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
      });
    } catch (error) {
      request.log.error({ error }, 'Error en GET /institutes/public/:slug');
      return reply.status(500).send({ error: 'Error interno del servidor' });
    }
  });

  // ========================================
  // RUTAS /current/* — deben ir ANTES de /:id/* para que Fastify no las capture como parámetro
  // ========================================

  // Ruta PÚBLICA para obtener configuración básica del instituto (logo, favicon, colores)
  // Esta ruta NO requiere autenticación para que el frontend pueda cargar el logo antes del login
  fastify.get('/current/config', async (request, reply) => {
    try {
      // Usar el slug del header inyectado por el middleware del subdominio
      const slug = (request.headers['x-institute-slug'] as string) || '';

      // Buscar en la Platform DB (siempre tiene el registro del instituto)
      const institute = await platformPrisma.institute.findFirst({
        where: slug
          ? { OR: [{ slug }, { subdomain: slug }] }
          : undefined,
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          status: true,
        }
      });

      if (!institute) {
        return reply.status(404).send({ success: false, message: 'Instituto no encontrado' });
      }

      return reply.send({ success: true, data: institute });
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
