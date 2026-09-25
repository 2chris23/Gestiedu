import { FastifyPluginAsync } from 'fastify';
import {
  login,
  refreshToken,
  logout,
  getProfile,
  changePassword,
  getSessions,
  deleteSession,
  deleteOtherSessions,
  crearLlaveDeTelefono,
  entrarConLaLlaveDelTelefono,
  anularLlaveDeTelefono,
} from '../controllers/auth.controller';
import { authenticate, userRateLimit } from '../middleware/auth.middleware';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const loginSchema = {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        keepSession: { type: 'boolean' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string' },
              avatar: { type: 'string' },
              institute: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
          },
          tokens: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'string' },
              tokenType: { type: 'string' },
            },
          },
        },
      },
    },
  };


  const refreshTokenSchema = {
    body: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          // BUG FIX: el schema declaraba `token`, pero el servicio devuelve
          // `accessToken` y `expiresIn`. Fastify serializaba la respuesta a {}
          // y el frontend (route.ts de refresh) recibía accessToken undefined.
          accessToken: { type: 'string' },
          // La llave de volver a entrar CAMBIA en cada renovación, y el
          // navegador tiene que quedarse con la nueva. Sin esta línea, Fastify
          // la borraba de la respuesta (solo deja pasar lo que está declarado)
          // y el navegador seguía con la vieja: a los pocos segundos se
          // quedaba fuera sin explicación.
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string' },
        },
      },
    },
  };

  const changePasswordSchema = {
    body: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string' },
        // 8, igual que al crear la cuenta. Estaba en 6: se podía cambiar a una
        // contraseña MÁS débil de la que el sistema exige para nacer.
        newPassword: { type: 'string', minLength: 8 },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
    },
  };

  // Rutas de autenticación
  // SEGURIDAD: Rate limiting estricto en login (10/min por IP+email) y refresh (20/min por IP)
  fastify.post('/login', { schema: loginSchema, preHandler: userRateLimit as any }, login);
  fastify.post('/refresh-token', { schema: refreshTokenSchema, preHandler: userRateLimit as any }, refreshToken);

  // Rutas protegidas
  fastify.post('/logout', { preHandler: authenticate }, logout as any);
  fastify.get('/profile', { preHandler: authenticate }, getProfile);
  fastify.post(
    '/change-password',
    { schema: changePasswordSchema, preHandler: authenticate },
    changePassword as any
  );

  /**
   * LA LLAVE DE ESTE TELÉFONO
   *
   * Tres rutas y una regla: **la primera vez en un teléfono se entra siempre
   * con correo y contraseña**. Guardar la llave pide sesión; entrar con ella
   * no —como el login—, y por eso lleva el mismo freno de intentos: por aquí
   * se podrían probar llaves a lo bruto igual que contraseñas.
   */
  const llaveSchema = {
    body: {
      type: 'object',
      required: ['llave'],
      properties: {
        llave: { type: 'string', minLength: 20, maxLength: 200 },
      },
    },
  };

  fastify.post('/llave-del-telefono', { preHandler: authenticate }, crearLlaveDeTelefono as any);
  fastify.post(
    '/entrar-con-el-telefono',
    { schema: llaveSchema, preHandler: userRateLimit as any },
    entrarConLaLlaveDelTelefono as any
  );
  fastify.post('/anular-llave-del-telefono', { preHandler: authenticate }, anularLlaveDeTelefono as any);

  // Sesiones/dispositivos activos del usuario autenticado
  fastify.get('/sessions', { preHandler: authenticate }, getSessions as any);
  fastify.delete('/sessions/others', { preHandler: authenticate }, deleteOtherSessions as any);
  fastify.delete('/sessions/:sessionId', { preHandler: authenticate }, deleteSession as any);
};

export { authRoutes };