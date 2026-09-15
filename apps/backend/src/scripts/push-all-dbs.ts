/**
 * RETIRADO. Este script ejecutaba `prisma db push --accept-data-loss` contra la
 * base de TODOS los liceos: fuerza el esquema y borra columnas o tablas con
 * datos sin preguntar. Además dejaba las bases sin historial de migraciones, así
 * que luego no se sabía en qué versión estaba cada liceo.
 *
 * Usa en su lugar:
 *   npm run migrate:tenants:status   → en qué versión está cada liceo
 *   npm run migrate:tenants          → aplica lo que falte (prisma migrate deploy)
 *
 * También desde el panel de superadmin: sección de migraciones.
 */
console.error(
    [
        'Este script fue retirado porque podía borrar datos de los liceos.',
        '',
        '  npm run migrate:tenants:status   ver el estado de cada liceo',
        '  npm run migrate:tenants          aplicar las migraciones pendientes',
        '',
    ].join('\n')
);
process.exit(1);
