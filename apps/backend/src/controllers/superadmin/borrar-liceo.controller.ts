import { esquemaPropio } from '../../config/esquema-del-liceo';
import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma as prisma } from '../../config/database';

/**
 * DELETE /api/superadmin/institutes/:id
 * Elimina un instituto y su base de datos
 */
export async function borrarLiceo(
        request: FastifyRequest<{ Params: { id: string }; Querystring: { force?: string } }>,
        reply: FastifyReply
    ) {
    const { id } = request.params;
    const force = request.query?.force === 'true';

    try {
        // 1. Buscar el instituto
        const institute = await prisma.institute.findUnique({
            where: { id }
        });

        if (!institute) {
            return reply.status(404).send({ error: 'Instituto no encontrado' });
        }

        console.log(`🗑️  Eliminando instituto: ${institute.name}`);
        console.log(`📊 Datos del instituto:`, {
            databaseName: institute.databaseName,
            databaseHost: institute.databaseHost,
            databasePort: institute.databasePort,
            hasDatabase: !!institute.databaseName
        });

        // 2. ANTES DE NADA: un respaldo del liceo entero.
        //
        // Lo que viene después es `DROP DATABASE`: se lleva todo —alumnos,
        // notas, asistencias, años completos— y no hay papelera que lo alcance,
        // porque la papelera vive dentro de esa misma base. Si el respaldo no
        // sale bien, no se borra nada.
        let respaldoPrevio: string | null = null;
        if (institute.databaseName) {
            const { respaldarLiceo } = await import('../../services/respaldos.service');
            const resultado = await respaldarLiceo(institute as any);

            if (!resultado.ok) {
                if (!force) {
                    return reply.status(409).send({
                        error: 'No se pudo respaldar el instituto antes de eliminarlo',
                        message:
                            `El instituto NO se eliminó porque el respaldo previo falló (${resultado.error}). ` +
                            `Sin respaldo, eliminarlo destruye sus datos para siempre. Resolvé el problema y ` +
                            `reintentá, o forzá a conciencia con ?force=true.`,
                        code: 'BACKUP_BEFORE_DELETE_FAILED',
                        databaseName: institute.databaseName,
                    });
                }
                console.warn(`⚠️  Respaldo previo fallido y se forzó el borrado: ${resultado.error}`);
            } else {
                respaldoPrevio = resultado.archivo ?? null;
                console.log(`💾 Respaldo previo guardado: ${respaldoPrevio} (${resultado.bytes} bytes)`);
            }
        }

        // 3. Eliminar la base de datos del tenant si existe
        //
        // EN LA BASE COMPARTIDA, EL LICEO ES SU ESQUEMA (2026-10-04). Antes de
        // revisarlo, borrar un liceo de la base compartida hacía `DROP DATABASE`
        // de ESA base: la de todos los liceos. Ahora: con esquema, se borra el
        // esquema y nada más; y una base que figura en la fila de otro liceo no
        // se borra nunca, ni con ?force=true.
        let dropError: string | null = null;
        // `public` es la base propia de siempre, no un esquema de la compartida.
        const esquema = esquemaPropio((institute as { databaseSchema?: string | null }).databaseSchema);
        const otrosEnLaBase = institute.databaseName
            ? await prisma.institute.count({ where: { databaseName: institute.databaseName, id: { not: institute.id } } })
            : 0;
        if (institute.databaseName && (esquema || otrosEnLaBase > 0)) {
            const { esquemaValido } = await import('../../config/esquema-del-liceo');
            if (!esquema) {
                dropError = `La base '${institute.databaseName}' la usan otros ${otrosEnLaBase} liceo(s) y este no tiene esquema propio: no se borra nada de ella.`;
            } else if (!esquemaValido(esquema) || esquema === 'public') {
                dropError = `Esquema no válido: ${esquema}`;
            } else {
                try {
                    const { Client } = await import('pg');
                    const { buildTenantDatabaseUrl } = await import('../../config/tenant-db-url');
                    const directa = new Client({ connectionString: buildTenantDatabaseUrl(institute as any, 'direct').split('?')[0] });
                    await directa.connect();
                    try {
                        await directa.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
                    } finally {
                        await directa.end();
                    }
                    console.log(`✅ Esquema eliminado: ${esquema} (la base ${institute.databaseName} sigue)`);
                } catch (dbError: any) {
                    console.error('⚠️  Error al eliminar el esquema:', dbError.message);
                    dropError = dbError.message;
                }
            }
        } else if (institute.databaseName) {
            try {
                const { Client } = await import('pg');

                // Extraer credenciales de la URL de la base de datos de la plataforma
                const platformDbUrl = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL || '';
                const dbUrlMatch = platformDbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);

                const dbUser = dbUrlMatch ? dbUrlMatch[1] : 'postgres';
                const dbPassword = dbUrlMatch ? dbUrlMatch[2] : 'postgres';
                const dbHost = institute.databaseHost || (dbUrlMatch ? dbUrlMatch[3] : 'localhost');
                const dbPort = institute.databasePort || (dbUrlMatch ? parseInt(dbUrlMatch[4]) : 5432);

                const adminClient = new Client({
                    host: dbHost,
                    port: dbPort,
                    user: dbUser,
                    password: dbPassword,
                    database: 'postgres'
                });

                await adminClient.connect();

                // Terminar conexiones activas
                await adminClient.query(`
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = $1
                    AND pid <> pg_backend_pid();
                `, [institute.databaseName]);

                // Eliminar la base de datos
                await adminClient.query(`DROP DATABASE IF EXISTS "${institute.databaseName}"`);
                await adminClient.end();

                console.log(`✅ Base de datos eliminada: ${institute.databaseName}`);
            } catch (dbError: any) {
                // ANTES: se hacía console.error y se borraba la fila igual. El
                // instituto desaparecía del panel pero su base seguía viva en
                // Postgres, huérfana y sin nada que la referenciara — imposible
                // de encontrar desde la app. Ahora el fallo se propaga.
                console.error('⚠️  Error al eliminar base de datos:', dbError.message);
                dropError = dbError.message;
            }
        }

        // 4. Si no se pudo dropear la base, NO se borra la fila: dejarla es lo
        //    único que mantiene localizable a esa base. Se corta aquí para que
        //    el SuperAdmin pueda reintentar, o forzar a conciencia con ?force=true.
        if (dropError && !force) {
            return reply.status(409).send({
                error: 'No se pudo eliminar la base de datos del instituto',
                message:
                    `El instituto NO se eliminó para no dejar la base '${institute.databaseName}' ` +
                    `huérfana en el servidor. Revisá los logs, resolvé el problema y reintentá. ` +
                    `Si querés eliminarlo igualmente, repetí la llamada con ?force=true.`,
                code: 'TENANT_DB_DROP_FAILED',
                databaseName: institute.databaseName,
            });
        }

        // 5. Eliminar el instituto de la plataforma
        await prisma.institute.delete({
            where: { id }
        });

        // 6. Invalidar caché de Redis para que el subdominio deje de responder
        try {
            const { RedisCache } = await import('../../config/redis');
            const slugKey = `institute:info:${institute.slug}`;
            const subdomainKey = `institute:info:${institute.subdomain}`;
            await RedisCache.del(slugKey);
            await RedisCache.del(subdomainKey);
            console.log(`🔄 Caché invalidado para: ${institute.slug}`);
        } catch (cacheError) {
            console.warn('⚠️  No se pudo invalidar el caché Redis:', cacheError);
        }

        console.log(`✅ Instituto eliminado: ${institute.name}`);

        return reply.send({
            message: 'Instituto eliminado exitosamente',
            institute: {
                id: institute.id,
                name: institute.name,
                code: institute.code
            },
            // Dónde quedó el respaldo, que es de lo único que se puede
            // recuperar el liceo si esto fue un error.
            ...(respaldoPrevio && { respaldo: respaldoPrevio }),
            // Con ?force=true el borrado sigue adelante, pero queda constancia
            // explícita de la base que quedó suelta y hay que limpiar a mano.
            ...(dropError && {
                warning: `La base '${institute.databaseName}' NO pudo eliminarse y quedó huérfana en el servidor; hay que borrarla manualmente.`,
                orphanDatabase: institute.databaseName,
            }),
        });
    } catch (error: any) {
        // Log específico del flujo de borrado (el handler central no sabe en qué
        // instituto estábamos); la respuesta la construye él.
        console.error(`❌ Error eliminando instituto ${id}:`, error);
        throw error;
    }
}
