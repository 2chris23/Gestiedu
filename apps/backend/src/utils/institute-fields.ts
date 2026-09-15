/**
 * Campos del modelo `Institute` que pueden salir en una respuesta HTTP.
 *
 * El modelo guarda en la misma fila las credenciales de conexión a la BD del
 * tenant (`databaseHost` / `databasePort` / `databaseUser` / `databasePassword`).
 * Cualquier endpoint que respondiera con la fila completa —`reply.send(institute)`,
 * `data: config`, `{ ...updatedInstitute }`— entregaba esa contraseña en texto
 * plano al cliente.
 *
 * Por eso esto es una LISTA BLANCA, no una lista negra: si mañana se agrega otra
 * columna sensible al schema de Prisma, no aparece sola en ninguna respuesta.
 * Aplica siempre, también en desarrollo — no hay rama condicional por entorno.
 *
 * Los únicos consumidores legítimos de las credenciales son
 * `config/database.ts` (arma la URL de conexión del tenant) y
 * `TenantProvisioningService` — nunca una respuesta HTTP.
 */

/** Columnas que jamás pueden viajar al cliente, por ningún endpoint. */
export const INSTITUTE_SECRET_FIELDS = [
    'databaseHost',
    'databasePort',
    'databaseUser',
    'databasePassword',
] as const;

/**
 * Select para el panel de SuperAdmin.
 *
 * Incluye `databaseName`, `adminId` y `notes` porque el panel los muestra
 * (`/superadmin/institutes/[id]` los renderiza), y por sí solos no permiten
 * conectarse a nada: sin host, usuario ni contraseña no son una credencial.
 */
export const INSTITUTE_SUPERADMIN_SELECT = {
    id: true,
    name: true,
    code: true,
    email: true,
    phone: true,
    address: true,
    slug: true,
    subdomain: true,
    customDomain: true,
    environment: true,
    status: true,
    trialEndsAt: true,
    notes: true,
    databaseName: true,
    adminId: true,
    timezone: true,
    country: true,
    city: true,
    academicConfig: true,
    logo: true,
    favicon: true,
    primaryColor: true,
    secondaryColor: true,
    subjectPalette: true,
    plan: true,
    maxStudents: true,
    maxTeachers: true,
    maxStorage: true,
    currentStudents: true,
    currentTeachers: true,
    currentStorage: true,
    monthlyPrice: true,
    billingStatus: true,
    nextBillingDate: true,
    createdAt: true,
    updatedAt: true,
};

/**
 * Select para endpoints del tenant (`/api/institutes/...`), a los que llega
 * cualquier usuario autenticado del instituto — incluidos STUDENT y TEACHER.
 *
 * Además de las credenciales quita `databaseName`, `adminId` y `notes`: son
 * detalles de infraestructura que un usuario del liceo no tiene por qué ver, y
 * `notes` en particular guarda el `error.message` crudo del provisioning, que
 * puede traer rutas absolutas del servidor.
 */
export const INSTITUTE_TENANT_SELECT = {
    id: true,
    name: true,
    code: true,
    email: true,
    phone: true,
    address: true,
    slug: true,
    subdomain: true,
    customDomain: true,
    environment: true,
    status: true,
    timezone: true,
    country: true,
    city: true,
    academicConfig: true,
    logo: true,
    favicon: true,
    primaryColor: true,
    secondaryColor: true,
    subjectPalette: true,
    plan: true,
    maxStudents: true,
    maxTeachers: true,
    maxStorage: true,
    currentStudents: true,
    currentTeachers: true,
    currentStorage: true,
    monthlyPrice: true,
    billingStatus: true,
    nextBillingDate: true,
    createdAt: true,
    updatedAt: true,
};

/**
 * Red de seguridad en tiempo de ejecución para objetos que ya se leyeron sin
 * `select` (por ejemplo el resultado de un `update` heredado). Borra las
 * credenciales de una copia; no muta el original.
 *
 * El `select` a nivel de query sigue siendo la defensa principal —así el secreto
 * ni siquiera sale de Postgres—; esto solo cubre los caminos que aún no lo usan.
 */
export function stripInstituteSecrets<T extends Record<string, any>>(
    institute: T
): Omit<T, typeof INSTITUTE_SECRET_FIELDS[number]> {
    const safe = { ...institute };
    for (const field of INSTITUTE_SECRET_FIELDS) {
        delete (safe as Record<string, unknown>)[field];
    }
    return safe;
}
