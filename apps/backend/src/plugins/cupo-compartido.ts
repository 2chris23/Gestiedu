import type Redis from 'ioredis';
import { redis } from '../config/redis';

// El almacén de memoria que trae el propio límite de peticiones. No declara
// tipos para su ruta interna, pero es el mismo que usa cuando no se le da otro.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LocalStore = require('@fastify/rate-limit/store/LocalStore');

/**
 * EL CUPO DE PETICIONES, EL MISMO PARA TODOS LOS PROCESOS
 *
 * El límite de peticiones contaba en la memoria del proceso. Con un solo
 * proceso da igual; con varios detrás del repartidor, cada uno llevaba su
 * propia cuenta: con cuatro procesos, cuatro veces el cupo, y el freno de
 * quien prueba contraseñas o martillea la API se quedaba en la cuarta parte.
 *
 * Ahora la cuenta vive en Redis, que todos los procesos comparten. Si Redis
 * no contesta, se sigue contando en la memoria del proceso: el freno nunca
 * se apaga, y nunca deja a nadie esperando a Redis (ver `config/redis.ts`).
 * Por eso no se usa el `redis:` que trae el plugin: con Redis caído, o deja
 * pasar todo (`skipOnError`) o responde 500 a todo.
 */

// La misma cuenta que hace el plugin con su almacén de Redis, sin los
// añadidos que aquí no se usan (castigo creciente, reiniciar al pasarse).
const CONTAR = `
  local actual = redis.call('INCR', KEYS[1])
  local ventana = tonumber(ARGV[1])
  if actual == 1 then
    redis.call('PEXPIRE', KEYS[1], ventana)
  else
    ventana = redis.call('PTTL', KEYS[1])
    if ventana < 0 then
      redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
      ventana = tonumber(ARGV[1])
    end
  end
  return {actual, ventana}
`;

const PREFIJO = 'gestion-escolar:cupo:';

type Resultado = { current: number; ttl: number };
type Aviso = (error: Error | null, resultado: Resultado | null) => void;

type ConContar = Redis & {
    contarCupo?: (clave: string, ventana: number) => Promise<[number, number]>;
};

function contarEnRedis(cliente: ConContar, clave: string, ventana: number): Promise<[number, number]> | null {
    if (cliente.status !== 'ready') return null;
    if (!cliente.contarCupo) {
        if (typeof cliente.defineCommand !== 'function') return null;
        cliente.defineCommand('contarCupo', { numberOfKeys: 1, lua: CONTAR });
    }
    return cliente.contarCupo!(clave, ventana);
}

export class CupoCompartido {
    private readonly enMemoria: any;
    private readonly prefijo: string;

    /** `@fastify/rate-limit` lo construye con sus opciones globales. */
    constructor(opciones: { continueExceeding?: boolean; exponentialBackoff?: boolean } = {}, prefijo = PREFIJO,
        private readonly cliente: ConContar = redis as ConContar) {
        this.enMemoria = new LocalStore(opciones.continueExceeding, opciones.exponentialBackoff);
        this.prefijo = prefijo;
    }

    incr(clave: string, avisar: Aviso, ventana: number, max: number): void {
        let enRedis: Promise<[number, number]> | null = null;
        try {
            enRedis = contarEnRedis(this.cliente, this.prefijo + clave, ventana);
        } catch {
            enRedis = null;
        }
        if (!enRedis) {
            this.enMemoria.incr(clave, avisar, ventana, max);
            return;
        }
        enRedis.then(
            ([actual, quedan]) => avisar(null, { current: Number(actual), ttl: Number(quedan) }),
            () => this.enMemoria.incr(clave, avisar, ventana, max),
        );
    }

    /** Un cupo propio para una ruta que declare el suyo. */
    child(opcionesDeRuta: { continueExceeding?: boolean; exponentialBackoff?: boolean; routeInfo: { method: string; url: string } }) {
        return new CupoCompartido(
            opcionesDeRuta,
            `${this.prefijo}${opcionesDeRuta.routeInfo.method}${opcionesDeRuta.routeInfo.url}:`,
            this.cliente,
        );
    }
}
