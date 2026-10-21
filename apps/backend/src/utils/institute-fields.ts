
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
    databaseSchema: true,
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