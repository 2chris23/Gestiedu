/**
 * DE DÓNDE SALE EL PUERTO
 *
 * Manda el archivo `.env`, **no** la variable `PORT` del entorno. No es un
 * capricho: esta máquina tenía un `PORT=3000` suelto en las variables del
 * usuario, el backend arrancó en el 3000 —encima de la web— y todo dejó de
 * funcionar. La explicación larga está en `src/config/environment.ts`.
 *
 * Pero los servicios de hospedaje sí asignan el puerto por variable, y las
 * mediciones necesitan levantar el servidor en un puerto aparte sin tocar el que
 * está en marcha. Para eso hay una variable **propia y explícita**, que nadie
 * tiene suelta por accidente: `PUERTO_DEL_HOST`.
 *
 * Estas pruebas fijan las dos mitades de la regla.
 */

/** Carga `config/environment.ts` de cero con el entorno que se le diga. */
function cargarConfig(entorno: Record<string, string | undefined>) {
    const antes = { ...process.env };
    for (const [k, v] of Object.entries(entorno)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }

    let config: { port: number };
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        config = require('../../config/environment').config;
    });

    process.env = antes;
    return config!;
}

describe('De dónde sale el puerto', () => {
    it('PUERTO-01: un PORT suelto en la máquina NO manda', () => {
        // Es el caso que rompió la máquina: PORT=3000 heredado del usuario.
        const config = cargarConfig({ PORT: '3000', PUERTO_DEL_HOST: undefined });
        expect(config.port).not.toBe(3000);
    });

    it('PUERTO-02: PUERTO_DEL_HOST sí manda, porque se pone a propósito', () => {
        const config = cargarConfig({ PUERTO_DEL_HOST: '8080' });
        expect(config.port).toBe(8080);
    });

    it('PUERTO-03: PUERTO_DEL_HOST gana también a un PORT suelto', () => {
        const config = cargarConfig({ PORT: '3000', PUERTO_DEL_HOST: '8081' });
        expect(config.port).toBe(8081);
    });

    it('PUERTO-04: sin PUERTO_DEL_HOST, se queda lo del archivo', () => {
        const delArchivo = cargarConfig({ PUERTO_DEL_HOST: undefined });
        const otraVez = cargarConfig({ PUERTO_DEL_HOST: undefined, PORT: '3999' });
        expect(otraVez.port).toBe(delArchivo.port);
    });
});
