/**
 * UNA BASE DE DATOS POR ARCHIVO DE PRUEBAS
 *
 * Antes todas las pruebas compartían una sola base, y varias la vaciaban entera
 * (`cleanTestDatabase`). Bastaba un solapamiento para que una suite borrara los
 * datos de otra: fallos intermitentes que no eran del sistema.
 *
 * Ahora cada archivo recibe su propia base, copiada de una plantilla ya migrada
 * (`CREATE DATABASE ... TEMPLATE ...`, que en PostgreSQL es una copia de
 * ficheros: milisegundos). Al terminar el archivo, la base se borra.
 *
 * La base de PLATAFORMA sigue siendo compartida: guarda el registro de los
 * institutos y las pruebas corren en serie, así que cada una la deja apuntando a
 * su propia base de tenant al arrancar su servidor.
 */
const NodeEnvironment = require('jest-environment-node').TestEnvironment;
const path = require('path');
const { Client } = require('pg');

function parseDbUrl(url) {
    const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    if (!m) throw new Error(`[jest-db] URL de postgres inválida: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4], 10), db: m[5] };
}

/** Nombre corto y único: PostgreSQL corta los identificadores en 63 caracteres. */
function dbNameFor(testPath) {
    const base = path
        .basename(testPath)
        .replace(/\.test\.ts$/, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .slice(0, 34);
    return `t_${base}_${process.pid}_${Date.now().toString(36).slice(-5)}`;
}

async function adminClient(creds) {
    const client = new Client({ ...creds, database: 'postgres' });
    await client.connect();
    return client;
}

class DatabasePerFileEnvironment extends NodeEnvironment {
    constructor(config, context) {
        super(config, context);
        this.testPath = context.testPath;
    }

    async setup() {
        await super.setup();

        const templateUrl = process.env.TEST_TEMPLATE_DATABASE_URL;
        const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

        // Sin plantilla (por ejemplo, si globalSetup no pudo crearla) se sigue
        // usando la base compartida: es mejor eso que no poder correr nada.
        if (!templateUrl || !baseUrl) return;

        const creds = parseDbUrl(baseUrl);
        const template = parseDbUrl(templateUrl).db;
        this.creds = creds;
        this.dbName = dbNameFor(this.testPath);

        const admin = await adminClient(creds);
        try {
            await admin.query(`CREATE DATABASE "${this.dbName}" TEMPLATE "${template}"`);
        } finally {
            await admin.end();
        }

        const url = `postgresql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${this.dbName}`;
        // Tanto en el proceso como en el sandbox del archivo de pruebas
        process.env.TEST_DATABASE_URL = url;
        process.env.DATABASE_URL = url;
        this.global.process.env.TEST_DATABASE_URL = url;
        this.global.process.env.DATABASE_URL = url;
    }

    async teardown() {
        if (this.dbName && this.creds) {
            try {
                const admin = await adminClient(this.creds);
                try {
                    // FORCE cierra las conexiones que hayan quedado abiertas
                    await admin.query(`DROP DATABASE IF EXISTS "${this.dbName}" WITH (FORCE)`);
                } finally {
                    await admin.end();
                }
            } catch {
                // Una base huérfana no debe hacer fallar la ejecución; se limpian
                // al arrancar (ver jest.globalSetup.js).
            }
        }
        await super.teardown();
    }
}

module.exports = DatabasePerFileEnvironment;
