/**
 * URL de conexión a la base de datos de un liceo.
 *
 * Cada liceo tiene su propia base, así que la aplicación abre un cliente Prisma
 * por liceo. Sin límite explícito, cada cliente abre su propio grupo de
 * conexiones y con pocas decenas de liceos activos se supera el máximo de
 * PostgreSQL (100 por defecto). De ahí las dos piezas de este módulo:
 *
 *   - `connection_limit`: cuántas conexiones puede abrir el cliente de CADA liceo.
 *   - PgBouncer: un repartidor delante de PostgreSQL que reutiliza un puñado de
 *     conexiones reales entre todos los clientes.
 *
 * Las migraciones NO pueden pasar por PgBouncer en modo transacción: necesitan
 * una conexión directa y estable para los bloqueos de Prisma Migrate. Por eso
 * `buildTenantDatabaseUrl` distingue entre uso normal (`runtime`) y directo.
 */

export interface TenantDbCredentials {
    databaseUser: string | null;
    databasePassword: string | null;
    databaseHost: string | null;
    databasePort: number | null;
    databaseName: string | null;
}

export type TenantUrlMode = 'runtime' | 'direct';

/**
 * DE DÓNDE SALE EL 2, QUE NO ES UN NÚMERO AL AZAR
 *
 * Todas las bases de los liceos viven en el MISMO servidor de PostgreSQL, y el
 * máximo de conexiones es del servidor entero, no de cada base. El sistema
 * guarda hasta 50 clientes de liceo a la vez (`MAX_CONNECTIONS` en
 * `config/database.ts`), así que en el peor caso:
 *
 *     conexiones = clientes guardados × este número
 *     50 × 2 = 100  →  justo el máximo por defecto de PostgreSQL
 *
 * Por eso es 2. Nadie lo había escrito, y por eso parecía arbitrario.
 *
 * ─── LO QUE CUESTA, MEDIDO DOS VECES Y EN DOS SITIOS ─────────────────────────
 *
 * Aquí hubo escrita durante meses una tabla que decía que el 2 costaba **2,6×**
 * y que convenía subirlo a 25. Al volver a medirlo con el repartidor levantado,
 * **no se reprodujo nada de eso**. La tabla vieja se cambia por esta, con el
 * método dicho y reproducible: `npm run medir:pozo`.
 *
 * **Solo la base de datos** (200 consultas a la vez, sin servidor de por medio;
 * base del liceo de carga, 15.000 personas; tres pasadas):
 *
 *     pozo  2 → 103-204 ms
 *     pozo  5 →  55- 56 ms
 *     pozo 10 →  41- 55 ms   ← lo mejor
 *     pozo 25 → 249-270 ms   ← PEOR que el 2
 *
 * El 25 es peor que el 2. Tiene sentido: son más conexiones que núcleos tiene la
 * máquina (12), y lo que se gana esperando menos se pierde peleándose por el
 * procesador. El punto bueno está en 5-10.
 *
 * **Por la API, que es lo que nota una persona** (50 personas a la vez, tres
 * llamadas cada una, la pantalla más pesada):
 *
 *     pozo  2, sin repartidor → p50 536 ms,  88 peticiones/s
 *     pozo 25, sin repartidor → p50 742 ms,  68 peticiones/s
 *
 * O sea: **por la API el pozo no se nota**, y subirlo a 25 va peor. El cuello de
 * botella con una petición completa no es el pozo: es el trabajo de responderla.
 *
 * ─── QUÉ PONER, ENTONCES ─────────────────────────────────────────────────────
 *
 * Dejarlo en **2**, que es lo que cabe con 50 liceos. Si el servidor lleva pocos
 * liceos y se quiere el punto bueno de la base, **5**; nunca 25. Y no subirlo a
 * ciegas: `cabenLasConexiones()` hace la cuenta al arrancar y lo dice.
 *
 * La salida de verdad para muchos liceos es PgBouncer, que reparte un puñado de
 * conexiones reales entre todos los clientes: diez liceos pasan de 20 conexiones
 * reales a 3. **Ya no es una promesa**: se levanta y se comprueba con
 * `npm run probar:pgbouncer` (sección 48 de la auditoría). Ver
 * `docs/DESPLIEGUE.md`.
 */
export const POZO_POR_DEFECTO = 2;

/** Conexiones que puede abrir el cliente de cada liceo. */
export function tenantConnectionLimit(): number {
    const raw = Number(process.env.TENANT_CONNECTION_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? raw : POZO_POR_DEFECTO;
}

export interface CuentaDeConexiones {
    cabe: boolean;
    /** Lo que se pediría en el peor caso: todos los liceos guardados, a tope. */
    peorCaso: number;
    /** Lo que el servidor puede dar de verdad. */
    disponibles: number;
    mensaje: string;
}

/**
 * ¿Cabe esta configuración en el servidor de base de datos?
 *
 * Se llama al arrancar. No corta el arranque —un servidor que no levanta es
 * peor que uno apretado— pero lo deja dicho en el registro con el número, para
 * que quien lo despliegue no se entere el día que 200 personas entren a la vez
 * y empiecen a salir errores de "no hay conexiones".
 *
 * Con PgBouncer delante la cuenta no aplica: ahí las conexiones de los clientes
 * no son conexiones reales de PostgreSQL, que es justo para lo que sirve.
 */
export function cabenLasConexiones(
    maxConexionesDelServidor: number,
    reservadas: number,
    clientesGuardados: number,
    pozo = tenantConnectionLimit()
): CuentaDeConexiones {
    const disponibles = Math.max(0, maxConexionesDelServidor - reservadas);
    const peorCaso = clientesGuardados * pozo;

    if (pgBouncer()) {
        return {
            cabe: true,
            peorCaso,
            disponibles,
            mensaje:
                `PgBouncer está delante: las ${peorCaso} conexiones de los liceos se reparten ` +
                `sobre unas pocas reales. La cuenta de PostgreSQL no aplica.`,
        };
    }

    if (peorCaso <= disponibles) {
        return {
            cabe: true,
            peorCaso,
            disponibles,
            mensaje:
                `Conexiones a la base: hasta ${peorCaso} en el peor caso ` +
                `(${clientesGuardados} liceos × ${pozo}), y el servidor da ${disponibles}. Cabe.`,
        };
    }

    const pozoQueCabe = Math.max(1, Math.floor(disponibles / clientesGuardados));
    return {
        cabe: false,
        peorCaso,
        disponibles,
        mensaje:
            `NO CABE: con TENANT_CONNECTION_LIMIT=${pozo} y ${clientesGuardados} liceos a la vez ` +
            `harían falta ${peorCaso} conexiones, y PostgreSQL solo da ${disponibles}. ` +
            `Con muchos liceos activos empezarán a fallar peticiones con "no hay conexiones". ` +
            `Opciones: bajar a TENANT_CONNECTION_LIMIT=${pozoQueCabe}, subir max_connections ` +
            `en PostgreSQL, o levantar PgBouncer (PGBOUNCER_HOST).`,
    };
}

/** Datos de PgBouncer, si está configurado. */
export function pgBouncer(): { host: string; port: number } | null {
    const host = process.env.PGBOUNCER_HOST;
    if (!host) return null;
    const port = Number(process.env.PGBOUNCER_PORT) || 6432;
    return { host, port };
}

export function buildTenantDatabaseUrl(
    credentials: TenantDbCredentials,
    mode: TenantUrlMode = 'runtime'
): string {
    const { databaseUser, databasePassword, databaseHost, databaseName } = credentials;
    if (!databaseUser || !databasePassword || !databaseHost || !databaseName) {
        throw new Error('Faltan credenciales de la base de datos del liceo');
    }

    const bouncer = mode === 'runtime' ? pgBouncer() : null;
    const host = bouncer?.host ?? databaseHost;
    const port = bouncer?.port ?? credentials.databasePort ?? 5432;

    const params = new URLSearchParams({ schema: 'public' });
    if (mode === 'runtime') {
        params.set('connection_limit', String(tenantConnectionLimit()));
        // PgBouncer en modo transacción no admite sentencias preparadas: este
        // parámetro le dice a Prisma que las desactive.
        if (bouncer) params.set('pgbouncer', 'true');
    }

    const user = encodeURIComponent(databaseUser);
    const password = encodeURIComponent(databasePassword);
    return `postgresql://${user}:${password}@${host}:${port}/${databaseName}?${params.toString()}`;
}

/** La misma URL con la contraseña oculta, para registros y mensajes de error. */
export function maskDatabaseUrl(url: string): string {
    return url.replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
}
