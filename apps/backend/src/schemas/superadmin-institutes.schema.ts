import { z } from 'zod';

/**
 * Esquemas de entrada para /api/superadmin/institutes.
 *
 * `PATCH /:id` pasaba `request.body` directo a `prisma.institute.update({ data })`,
 * así que un SuperAdmin podía escribir CUALQUIER columna del modelo `Institute`:
 * las únicas (`subdomain`, `slug`, `code`), los límites de plan (`plan`,
 * `maxStudents`, ...) y — lo más grave — las credenciales de conexión del tenant
 * (`databaseHost`, `databaseUser`, `databasePassword`, `databaseName`), con las
 * que se podría redirigir la conexión de un instituto a otro servidor.
 *
 * `.strict()` es lo que cierra ese agujero: cualquier clave no declarada aquí
 * hace fallar la validación con 400 (`VALIDATION_ERROR`) antes de tocar Prisma.
 * El mensaje de zod nombra las claves rechazadas, así que el 400 es diagnosticable.
 */

/** #RGB o #RRGGBB */
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Texto opcional de una columna nullable. El formulario de SuperAdmin envía
 * siempre los cinco campos del bloque "Información General", con `''` cuando
 * están vacíos, así que la cadena vacía tiene que seguir siendo válida.
 */
const optionalText = (max: number, label: string) =>
    z.string().trim().max(max, `${label} no puede tener más de ${max} caracteres`).optional();

export const updateInstituteSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(3, 'El nombre debe tener al menos 3 caracteres')
            .max(150, 'El nombre no puede tener más de 150 caracteres')
            .optional(),
        /**
         * El email de contacto es OPCIONAL: un instituto puede no tener uno.
         * El formulario de SuperAdmin envía siempre el campo, con `''` cuando
         * está vacío (ver `apps/web/src/app/superadmin/institutes/[id]/page.tsx`),
         * así que `''` y `null` son entradas válidas y ambas se normalizan a
         * `null` antes de llegar a Prisma. Si viene un valor, sí debe ser un
         * email bien formado.
         */
        email: z
            .string()
            .trim()
            .max(150, 'El email no puede tener más de 150 caracteres')
            .nullable()
            .transform((v) => (v === null || v === '' ? null : v))
            .refine((v) => v === null || z.string().email().safeParse(v).success, {
                message: 'Email inválido',
            })
            // `.optional()` va al final a propósito: si la clave no viene en el
            // body, tiene que quedar AUSENTE del objeto validado. Con
            // `.optional()` antes del transform, una clave omitida se
            // convertiría en `email: null` y borraría el email existente.
            .optional(),
        phone: optionalText(30, 'El teléfono'),
        address: optionalText(255, 'La dirección'),
        status: z
            .enum(['ACTIVE', 'SUSPENDED', 'PENDING', 'INACTIVE'], {
                errorMap: () => ({
                    message: 'Estado inválido. Opciones: ACTIVE, SUSPENDED, PENDING, INACTIVE',
                }),
            })
            .optional(),
        primaryColor: z
            .string()
            .trim()
            .regex(HEX_COLOR, 'El color primario debe ser hexadecimal (#RGB o #RRGGBB)')
            .optional(),
        secondaryColor: z
            .string()
            .trim()
            .regex(HEX_COLOR, 'El color secundario debe ser hexadecimal (#RGB o #RRGGBB)')
            .optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: 'Debe enviarse al menos un campo para actualizar',
    });

export type UpdateInstituteInput = z.infer<typeof updateInstituteSchema>;

/**
 * `PUT /:id/plan`. El controller ya valida el nombre del plan contra la lista
 * blanca y deriva los límites de `config/plans`, pero el body seguía sin
 * esquema: `nextBillingDate` llegaba a `new Date(...)` sin comprobar y las
 * claves extra viajaban hasta el controller. `.strict()` las rechaza aquí.
 */
export const changePlanSchema = z
    .object({
        plan: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE'], {
            errorMap: () => ({
                message: 'Plan inválido. Opciones: BASIC, PREMIUM, ENTERPRISE',
            }),
        }),
        nextBillingDate: z
            .string()
            .datetime('La fecha de facturación debe estar en formato ISO 8601')
            .optional(),
    })
    .strict();

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
