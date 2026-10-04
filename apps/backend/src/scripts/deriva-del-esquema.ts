/**
 * ¿LAS MIGRACIONES DICEN LO MISMO QUE EL ESQUEMA?
 *
 * Las migraciones de los liceos se escriben a mano. Si una dice algo distinto
 * de `schema.prisma` (un índice que falta, una llave sin ON UPDATE CASCADE…),
 * Prisma no avisa: el cliente cree que la base es como dice el esquema.
 *
 *   npx tsx src/scripts/deriva-del-esquema.ts [slug]
 *
 * Compara la base de un liceo ya migrado (instituto-testing por defecto) con el
 * esquema y enseña el SQL que faltaría. Vacío = coinciden. No toca nada.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import path from 'path';
import { platformPrisma } from '../config/database';
import { buildTenantDatabaseUrl, maskDatabaseUrl } from '../config/tenant-db-url';

async function main(): Promise<number> {
    const slug = process.argv[2] || 'instituto-testing';
    const liceo = await platformPrisma.institute.findUnique({ where: { slug } });
    if (!liceo) {
        console.error(`No existe el liceo ${slug}`);
        return 1;
    }
    const url = buildTenantDatabaseUrl(liceo as any, 'direct');
    const esquema = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    try {
        const salida = execFileSync(
            process.execPath,
            [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', esquema, '--script'],
            // El esquema de Prisma toma su `schema=` de DATABASE_URL. Con la del
            // liceo, los dos lados hablan del mismo esquema; con la de la
            // plataforma (`public`), un liceo de la base compartida salía con
            // TODO como deriva: «borrar sus 76 tablas y crearlas en public».
            { encoding: 'utf-8', env: { ...process.env, DATABASE_URL: url } }
        );
        const sql = salida.split('\n').filter((l) => l.trim() && !l.startsWith('--')).join('\n');
        console.log(sql ? `Deriva en ${slug}:\n${salida}` : `${slug}: la base y el esquema coinciden.`);
        return sql ? 1 : 0;
    } catch (e: any) {
        console.error(maskDatabaseUrl(String(e?.stderr || e?.message)));
        return 1;
    }
}

main().then(async (c) => {
    await platformPrisma.$disconnect();
    process.exit(c);
});
