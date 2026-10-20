import { API_BASE_URL, Avance, Hecho, escribirHecho, apuntarLaMarca, esperar, LENTO, apuntarLosFallos, Opciones, cabecerasDeDescarga } from './precarga';
import api from '@/lib/axios';
import { conAzar } from '@/lib/azar';
import { guardarRespuestas, guardarRespuestasCrudas } from '@/lib/respuestas-guardadas';
import { guardarEstasPaginasYEsperar } from '@/lib/paginas-guardadas';
import { pedirElIndice, bajarLosCubos } from '@/lib/cubos';

export async function bajarPaquetePreparado(
    primeraRespuesta: Response,
    o: Opciones,
    red: { bytes: () => number },
    hecho: Hecho,
    avisar: (a: Avance) => void,
    laCascara: Promise<void>
): Promise<'listo' | 'cancelada'> {
    const totalBytesRed = parseInt(primeraRespuesta.headers.get('content-length') || '0', 10);
    const marcaPaquete = parseInt(primeraRespuesta.headers.get('x-paquete-marca') || '0', 10);
    const versionPaquete = primeraRespuesta.headers.get('x-paquete-version') || '';
    const lecturasTotales = parseInt(primeraRespuesta.headers.get('x-paquete-lecturas') || '0', 10);

    // Lanzar la descarga de páginas en paralelo con el paquete y la cáscara (Punto 1)
    let paginasIniciales: string[] = o.menu;
    const paginasHeader = primeraRespuesta.headers.get('x-paquete-paginas');
    if (paginasHeader) {
        try {
            const parseadas = JSON.parse(paginasHeader);
            if (Array.isArray(parseadas) && parseadas.length > 0) {
                paginasIniciales = parseadas;
            }
        } catch {}
    }
    const promesaPaginas = guardarEstasPaginasYEsperar(paginasIniciales);

    const LLAVE_RESUMEN = 'gestiedu:paquete-progreso';

    // Medición de rendimiento para informe (Fase B, Punto 3)
    const tInicio = performance.now();
    let msBajarYDescomprimir = 0;
    let msIndexedDB = 0;
    let msCambios = 0;

    // Medición de ritmo
    const muestras: Array<[number, number]> = [];
    const empezo = performance.now();
    const apuntarRitmo = (b: number) => {
        const ahora = performance.now();
        muestras.push([ahora, b]);
        while (muestras.length > 2 && ahora - muestras[0][0] > 5000) muestras.shift();
    };
    const elRitmo = (b: number): number | null => {
        const segundos = (performance.now() - empezo) / 1000;
        if (b === 0 || segundos < 1) return null;
        if (muestras.length >= 2) {
            const [t0, b0] = muestras[0];
            const [t1, b1] = muestras[muestras.length - 1];
            if (t1 - t0 >= 1500) return ((b1 - b0) * 1000) / (t1 - t0);
        }
        return b / segundos;
    };

    let resActual: Response = primeraRespuesta;
    let bytesRecibidosRed = 0;
    let descargadoCompleto = false;
    let bytesDescomprimidosTotal = 0;
    let lecturasGuardadas = 0;
    let loteCrudo: Array<{ clave: string; texto: string; bytes: number }> = [];
    let loteFallos: Record<string, number> = {};
    const fallos5xx: string[] = [];

    const procesarLote = async () => {
        if (loteCrudo.length === 0 && Object.keys(loteFallos).length === 0) return;
        const n = loteCrudo.length + Object.keys(loteFallos).length;
        const tIdb0 = performance.now();
        const b = await guardarRespuestasCrudas(o.dueno, loteCrudo);
        msIndexedDB += performance.now() - tIdb0;
        bytesDescomprimidosTotal += b;
        await apuntarLosFallos(o.dueno, loteFallos, fallos5xx);
        lecturasGuardadas += n;
        loteCrudo = [];
        loteFallos = {};
        avisar({
            fase: 'bajando',
            bytes: bytesDescomprimidosTotal,
            bytesTotales: bytesDescomprimidosTotal,
            bloquesHechos: 1,
            bloques: 1,
            lecturasHechas: lecturasGuardadas,
            lecturasTotales,
            bytesPorLaRed: red.bytes() || bytesRecibidosRed,
            velocidad: elRitmo(bytesDescomprimidosTotal),
        });
    };

    while (!descargadoCompleto) {
        if (o.cancelada()) return 'cancelada';
        try {
            if (!resActual.body) throw new Error('No body');

            let ultimoAvisoRed = 0;
            const contadorStream = new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                    bytesRecibidosRed += chunk.byteLength;
                    const ahora = performance.now();
                    if (ahora - ultimoAvisoRed > 250) {
                        ultimoAvisoRed = ahora;
                        apuntarRitmo(bytesRecibidosRed);
                        avisar({
                            fase: 'bajando',
                            bytes: bytesRecibidosRed,
                            bytesTotales: totalBytesRed || bytesRecibidosRed,
                            bloquesHechos: 0,
                            bloques: 1,
                            lecturasHechas: 0,
                            lecturasTotales,
                            bytesPorLaRed: red.bytes() || bytesRecibidosRed,
                            velocidad: elRitmo(bytesRecibidosRed),
                        });
                    }
                    controller.enqueue(chunk);
                },
            });

            const textStream = resActual.body
                .pipeThrough(contadorStream)
                .pipeThrough(new DecompressionStream('gzip') as any)
                .pipeThrough(new TextDecoderStream());

            const textReader = textStream.getReader();
            let bufferTexto = '';
            const tStream0 = performance.now();

            while (true) {
                if (o.cancelada()) return 'cancelada';
                const { done, value } = await textReader.read();
                if (done) {
                    descargadoCompleto = true;
                    break;
                }
                bufferTexto += value;
                let start = 0;
                let nlIdx: number;
                while ((nlIdx = bufferTexto.indexOf('\n', start)) !== -1) {
                    let linea = bufferTexto.slice(start, nlIdx);
                    start = nlIdx + 1;
                    if (linea.endsWith('\r')) linea = linea.slice(0, -1);
                    if (!linea.trim()) continue;

                    const dIdx = linea.indexOf(',\"d\":');
                    if (dIdx !== -1) {
                        try {
                            const clave = JSON.parse(linea.slice(5, dIdx));
                            const texto = linea.slice(dIdx + 5, linea.endsWith('}') ? -1 : undefined);
                            loteCrudo.push({ clave, texto, bytes: linea.length });
                        } catch {
                            try {
                                const parsed = JSON.parse(linea);
                                if (parsed.c && parsed.d !== undefined) {
                                    loteCrudo.push({ clave: parsed.c, texto: JSON.stringify(parsed.d), bytes: linea.length });
                                }
                            } catch {}
                        }
                    } else {
                        const fIdx = linea.indexOf(',\"f\":');
                        if (fIdx !== -1) {
                            try {
                                const clave = JSON.parse(linea.slice(5, fIdx));
                                const codigo = parseInt(linea.slice(fIdx + 5, -1), 10);
                                loteFallos[clave] = codigo;
                            } catch {}
                        }
                    }
                }
                bufferTexto = bufferTexto.slice(start);
            }

            if (bufferTexto.trim()) {
                const linea = bufferTexto.trim();
                const dIdx = linea.indexOf(',\"d\":');
                if (dIdx !== -1) {
                    try {
                        const clave = JSON.parse(linea.slice(5, dIdx));
                        const texto = linea.slice(dIdx + 5, linea.endsWith('}') ? -1 : undefined);
                        loteCrudo.push({ clave, texto, bytes: linea.length });
                    } catch {}
                }
            }

            msBajarYDescomprimir = Math.max(0, performance.now() - tStream0);

            // Guardar en una sola transacción atómica directa en IndexedDB
            const tIdb0 = performance.now();
            await procesarLote();
            msIndexedDB = performance.now() - tIdb0;
        } catch {
            if (o.cancelada()) return 'cancelada';
            avisar({
                fase: 'esperando',
                bytes: bytesRecibidosRed,
                bytesTotales: totalBytesRed || bytesRecibidosRed,
                bloquesHechos: 0,
                bloques: 1,
                lecturasHechas: 0,
                lecturasTotales,
                bytesPorLaRed: red.bytes() || bytesRecibidosRed,
                velocidad: null,
            });

            while (!o.hayConexion() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
                if (o.cancelada()) return 'cancelada';
                await esperar(1000);
            }

            try {
                const cab = await cabecerasDeDescarga();
                resActual = await fetch(`${API_BASE_URL}/precarga/paquete`, {
                    method: 'GET',
                    headers: { ...cab },
                });
                bytesRecibidosRed = 0;
            } catch {
                await esperar(1000);
            }
        }
    }

    // Reintentar lecturas 5xx si las hubo
    if (fallos5xx.length) {
        for (let i = 0; i < fallos5xx.length; i += 150) {
            try {
                const r = (await api.post('/precarga/bloque', { lecturas: fallos5xx.slice(i, i + 150) }, LENTO)).data as {
                    datos: Record<string, unknown>;
                    fallos: Record<string, number>;
                };
                const b = await guardarRespuestas(o.dueno, Object.entries(r.datos ?? {}));
                bytesDescomprimidosTotal += b;
                await apuntarLosFallos(o.dueno, r.fallos, []);
            } catch {}
        }
    }

    // Ponerse al día con los cambios desde la marca del paquete
    let paginasAGuardar: string[] = o.menu;
    let marcaFinal = marcaPaquete;

    const tCambios0 = performance.now();
    if (Number.isFinite(marcaPaquete)) {
        try {
            const cab = await cabecerasDeDescarga();
            const { data } = await api.post('/precarga/cambios', { desde: marcaPaquete, menu: o.menu }, { headers: cab });
            const r = data as { marca: number; lecturas: string[]; todo?: boolean; porBloque?: number; paginas?: string[] };
            if (Array.isArray(r.paginas) && r.paginas.length) {
                paginasAGuardar = r.paginas;
            }
            if (Number.isFinite(r.marca)) marcaFinal = r.marca;

            if (r.lecturas && r.lecturas.length) {
                const porBloque = Math.max(1, r.porBloque || 150);
                for (let i = 0; i < r.lecturas.length; i += porBloque) {
                    const { data: b } = await api.post(
                        '/precarga/bloque',
                        { lecturas: r.lecturas.slice(i, i + porBloque) },
                        { ...LENTO, headers: cab }
                    );
                    const bytesNuevos = await guardarRespuestas(o.dueno, Object.entries((b?.datos ?? {}) as Record<string, unknown>));
                    bytesDescomprimidosTotal += bytesNuevos;
                    await apuntarLosFallos(o.dueno, b?.fallos, []);
                }
            }
        } catch {
            // Continuar si la petición de cambios no responde
        }
    }
    msCambios = performance.now() - tCambios0;

    // Guardar páginas y cáscara
    avisar({
        fase: 'paginas',
        bytes: bytesDescomprimidosTotal,
        bytesTotales: bytesDescomprimidosTotal,
        bloquesHechos: 1,
        bloques: 1,
        lecturasHechas: lecturasGuardadas,
        lecturasTotales,
        bytesPorLaRed: red.bytes() || bytesRecibidosRed,
        velocidad: elRitmo(bytesDescomprimidosTotal),
    });

    // Esperar páginas y cáscara que corrieron en paralelo con el paquete (Punto 1)
    const promesasFinales: Promise<unknown>[] = [promesaPaginas, laCascara];
    const paginasNuevas = paginasAGuardar.filter((p) => !paginasIniciales.includes(p));
    if (paginasNuevas.length > 0) {
        promesasFinales.push(guardarEstasPaginasYEsperar(paginasNuevas));
    }
    await Promise.all(promesasFinales);

    hecho.version = versionPaquete || 'paquete-1';
    hecho.hechos = [0];
    hecho.bytes = bytesDescomprimidosTotal;
    hecho.completa = true;
    hecho.cuando = Date.now();
    escribirHecho(hecho);

    if (Number.isFinite(marcaFinal)) apuntarLaMarca(o.dueno, marcaFinal);
    try {
        localStorage.removeItem(LLAVE_RESUMEN);
    } catch {}

    const msTotal = performance.now() - tInicio;
    const metricas = {
        msBajarYDescomprimir: Math.round(msBajarYDescomprimir),
        msIndexedDB: Math.round(msIndexedDB),
        msCambios: Math.round(msCambios),
        msTotal: Math.round(msTotal),
        lecturasTotales,
        bytesRed: bytesRecibidosRed,
    };
    if (typeof window !== 'undefined') {
        (window as any).__medicionPrecarga = metricas;
        console.log('[PRECARGA-METRICAS]', JSON.stringify(metricas));
    }

    avisar({
        fase: 'listo',
        bytes: bytesDescomprimidosTotal,
        bytesTotales: bytesDescomprimidosTotal,
        bloquesHechos: 1,
        bloques: 1,
        lecturasHechas: lecturasGuardadas,
        lecturasTotales,
        bytesPorLaRed: red.bytes() || bytesRecibidosRed,
        velocidad: elRitmo(bytesDescomprimidosTotal),
    });

    return 'listo';
}

/**
 * EL CAMINO DE AHORA: LOS CUBOS (`lib/cubos.ts`, 18-oct-2026)
 *
 * Todo está armado de antemano en el servidor: se pide el índice (una
 * consulta) y se bajan los cubos. 'no-hay' = un servidor de antes: se sigue
 * por el paquete y el plan de siempre.
 */
export async function bajarConCubos(o: Opciones, hecho: Hecho, avisar: (a: Avance) => void, laCascara: Promise<void>): Promise<'listo' | 'cancelada' | 'no-hay'> {
    const base: Avance = { fase: 'empezando', bytes: 0, bytesTotales: null, bloquesHechos: 0, bloques: 1, lecturasHechas: 0, lecturasTotales: 0, bytesPorLaRed: 0, velocidad: null };
    let espera = 0;
    for (;;) {
        if (o.cancelada()) return 'cancelada';
        if (!o.hayConexion()) {
            avisar({ ...base, fase: 'esperando' });
            await esperar(1000);
            continue;
        }
        const r = await pedirElIndice();
        if (r === 'no-hay') return 'no-hay';
        if (r === 'sin-conexion') {
            avisar({ ...base, fase: 'esperando' });
            espera = Math.min(espera + 1, 5);
            await esperar(conAzar(Math.min(15_000, 1000 * 2 ** espera)));
            continue;
        }
        if ('preparando' in r) {
            // Una cuenta de hace un momento: el servidor la tiene en la cola.
            avisar({ ...base, fase: 'preparando' });
            await esperar(conAzar(1500));
            continue;
        }
        const indice = r.listo;
        const lasPaginas = guardarEstasPaginasYEsperar(indice.paginas.length ? indice.paginas : o.menu);
        const fin = await bajarLosCubos(o.dueno, indice, {
            cancelada: o.cancelada,
            hayConexion: o.hayConexion,
            alAvanzar: (a) =>
                avisar({
                    ...base,
                    fase: a.esperando ? 'esperando' : 'bajando',
                    bytes: a.recibidos,
                    bytesTotales: a.total,
                    lecturasHechas: a.porcentaje,
                    lecturasTotales: 100,
                    porcentaje: a.porcentaje,
                    velocidad: a.velocidad,
                }),
        });
        if (fin === 'cancelada') return 'cancelada';
        await Promise.all([lasPaginas, laCascara]);
        hecho.version = 'cubos';
        hecho.hechos = [0];
        hecho.bytes = fin.guardado;
        hecho.completa = true;
        hecho.cuando = Date.now();
        escribirHecho(hecho);
        apuntarLaMarca(o.dueno, indice.marca);
        avisar({ ...base, fase: 'listo', bytes: indice.bytes, bytesTotales: indice.bytes, porcentaje: 100, lecturasHechas: 100, lecturasTotales: 100 });
        return 'listo';
    }
}
