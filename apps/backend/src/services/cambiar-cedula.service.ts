import { createError } from '../middleware/error.middleware';
import { invalidateUserSession } from '../middleware/auth.middleware';
import { invalidateUserCache } from '../utils/cache-invalidation';
import { esCedulaEscolar } from '../utils/cedula-escolar';
import { userIdSchema } from '../utils/validators';

/**
 * CAMBIAR LA CÉDULA DE UNA PERSONA
 *
 * El caso de todos los años: el alumno entró con **cédula escolar** y ya sacó
 * la de identidad. O el admin se equivocó al escribirla. La cédula es el
 * identificador de la cuenta (`users.id`), así que cambiarla es cambiar la
 * llave de todo lo suyo: notas, asistencia, observaciones, pagos, boletas…
 *
 * - Todas las llaves foráneas a `users.id` son `ON UPDATE CASCADE`
 *   (comprobado en las migraciones: 31 de 31), así que la base arrastra sola
 *   las filas que la nombran.
 * - Lo que la base NO arrastra, porque no es una llave foránea, se reescribe
 *   aquí: el mapa de notas de cada actividad de la clase en vivo
 *   (`class_activities.scores`), el de «evaluado de otra forma», los alumnos
 *   implicados de una clase (`class_sessions.involvedStudentIds`) y los avisos
 *   que la mencionan (`notifications.data`).
 * - El historial (auditoría, papelera) se queda como estaba: dice lo que pasó
 *   con la cédula de entonces.
 * - Se cierran sus sesiones (y la llave de la huella): el token que lleva
 *   encima dice la cédula vieja. Vuelve a entrar con su correo y contraseña.
 * - Si la de antes era escolar, queda guardada en `cedulaEscolar` (la
 *   certificación de notas de 1er año la nombra).
 *
 * Solo el admin (lo protege la ruta). Pruebas: CED-04…06.
 */
export async function cambiarLaCedula(
    prisma: any,
    instituteId: string,
    datos: { vieja: string; nueva: string; tipo?: 'IDENTIDAD' | 'ESCOLAR'; quien: string }
): Promise<{ id: string; tipoDeCedula: string | null; cedulaEscolar: string | null }> {
    const vieja = datos.vieja;
    const nueva = String(datos.nueva ?? '').trim().toUpperCase();

    if (!userIdSchema.safeParse(nueva).success) {
        throw createError(400, 'La cédula nueva tiene de 7 a 12 letras, números y guiones.', 'CEDULA_INVALIDA');
    }
    if (nueva === vieja) throw createError(400, 'La cédula nueva es igual a la que tiene.', 'CEDULA_IGUAL');
    if (datos.quien === vieja) {
        throw createError(400, 'Tu propia cédula la cambia otro administrador: perderías la sesión a mitad.', 'CEDULA_PROPIA');
    }

    const persona = await prisma.user.findUnique({ where: { id: vieja }, select: { id: true, tipoDeCedula: true, cedulaEscolar: true } });
    if (!persona) throw createError(404, 'Esa persona no existe.', 'USUARIO_NO_ENCONTRADO');
    if (await prisma.user.findUnique({ where: { id: nueva }, select: { id: true } })) {
        throw createError(409, 'Esa cédula ya es de otra persona del liceo.', 'CEDULA_EN_USO');
    }

    const tipo = datos.tipo ?? (esCedulaEscolar(nueva) ? 'ESCOLAR' : 'IDENTIDAD');
    const eraEscolar = persona.tipoDeCedula === 'ESCOLAR' || esCedulaEscolar(vieja);
    const cedulaEscolar = tipo === 'IDENTIDAD' && eraEscolar ? vieja : persona.cedulaEscolar ?? null;

    await prisma.$transaction(async (tx: any) => {
        // La llave: la base arrastra todas las filas que la nombran.
        await tx.$executeRaw`
            UPDATE "users" SET "id" = ${nueva}, "tipoDeCedula" = ${tipo}, "cedulaEscolar" = ${cedulaEscolar}, "updatedAt" = now()
             WHERE "id" = ${vieja}`;

        // Lo que no es llave foránea.
        await tx.$executeRaw`
            UPDATE "class_activities"
               SET "scores" = ("scores" - ${vieja}::text) || jsonb_build_object(${nueva}::text, "scores" -> ${vieja}::text)
             WHERE "scores" ? ${vieja}::text`;
        await tx.$executeRaw`
            UPDATE "class_activities"
               SET "evaluadoDeOtraForma" = ("evaluadoDeOtraForma" - ${vieja}::text)
                   || jsonb_build_object(${nueva}::text, "evaluadoDeOtraForma" -> ${vieja}::text)
             WHERE "evaluadoDeOtraForma" ? ${vieja}::text`;
        await tx.$executeRaw`
            UPDATE "class_sessions"
               SET "involvedStudentIds" = array_replace("involvedStudentIds", ${vieja}::text, ${nueva}::text)
             WHERE ${vieja}::text = ANY("involvedStudentIds")`;
        // En los avisos, solo el valor exacto (entre comillas): una cédula
        // puede ser parte de otro número.
        await tx.$executeRaw`
            UPDATE "notifications"
               SET "data" = replace("data"::text, ${`"${vieja}"`}, ${`"${nueva}"`})::jsonb
             WHERE "data"::text LIKE ${`%"${vieja}"%`}`;

        // Sus sesiones y la llave de la huella dicen la cédula vieja: fuera.
        await tx.refreshToken.deleteMany({ where: { userId: nueva } });
        await tx.deviceKey.deleteMany({ where: { userId: nueva } });

        await tx.auditLog.create({
            data: {
                instituteId,
                action: 'UPDATE',
                entity: 'USER',
                entityType: 'USER',
                entityId: nueva,
                oldValues: { id: vieja, tipoDeCedula: persona.tipoDeCedula ?? null },
                newValues: { id: nueva, tipoDeCedula: tipo },
                metadata: { motivo: 'cambio de cédula' },
                userId: datos.quien,
            },
        });
    });

    await Promise.all([
        invalidateUserSession(instituteId, vieja),
        invalidateUserCache(instituteId, vieja),
        invalidateUserCache(instituteId, nueva),
    ]).catch(() => undefined);

    return { id: nueva, tipoDeCedula: tipo, cedulaEscolar };
}
