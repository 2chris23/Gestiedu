import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import helmet from '@fastify/helmet';

/**
 * Plugin de seguridad con Helmet
 * Configura headers HTTP de seguridad
 */
const helmetPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const isProduction = process.env.NODE_ENV === 'production';

    await fastify.register(helmet, {
        // ✅ SECURITY: Content Security Policy
        contentSecurityPolicy: isProduction ? {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Permite estilos inline (necesario para algunos frameworks)
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        } : false, // Desactivado en desarrollo para facilitar debugging

        // ✅ SECURITY: Previene clickjacking
        frameguard: {
            action: 'deny', // No permite que la página sea embebida en iframes
        },

        // ✅ SECURITY: Previene MIME type sniffing
        noSniff: true,

        // ✅ SECURITY: Fuerza HTTPS en producción
        hsts: isProduction ? {
            maxAge: 31536000, // 1 año en segundos
            includeSubDomains: true,
            preload: true,
        } : false,

        // ✅ SECURITY: Previene que el navegador envíe el Referer header
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },

        // ✅ SECURITY: Desactiva el header X-Powered-By
        hidePoweredBy: true,

        // ✅ SECURITY: Previene que IE ejecute scripts en contexto de la página
        ieNoOpen: true,

        // ✅ SECURITY: Previene que navegadores antiguos detecten el MIME type
        xssFilter: true,

        // ✅ SECURITY: Previene que el navegador haga DNS prefetching
        dnsPrefetchControl: {
            allow: false,
        },

        // ✅ SECURITY: Previene que el navegador descargue recursos externos
        permittedCrossDomainPolicies: {
            permittedPolicies: 'none',
        },
    });

    fastify.log.info(`🛡️  Helmet security headers configured (Production: ${isProduction})`);
};

export default fastifyPlugin(helmetPlugin);
