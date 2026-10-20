/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { esCedulaEscolar } from '../../utils/cedula-escolar';
/**
 * Cuánto cuesta cifrar una contraseña.
 *
 * Cada vuelta dobla el trabajo. Estaba en 10; se sube a 12, que es lo
 * recomendado hoy. Al que entra le cuesta unas décimas de segundo más — no lo
 * nota. A quien intente probar contraseñas a lo bruto le cuesta cuatro veces
 * más, y eso sí lo nota.
 */
export const VUELTAS_DE_CIFRADO = 12;
/** Resuelve el instituto actual del request (inyectado por identifyTenant). */
export function getInstituteId(request: FastifyRequest): string | null {
  return request.institute?.id ?? (request.user as any)?.instituteId ?? null;
}

/** Guard para operaciones que requieren tenant resuelto (fail closed, no hardcode). */
export function requireTenant(request: FastifyRequest, reply: FastifyReply): string | null {
  const instituteId = getInstituteId(request);
  if (!instituteId || !request.tenantPrisma) {
    reply.status(400).send({
      error: 'No se pudo determinar el instituto',
      code: 'INSTITUTE_REQUIRED',
    });
    return null;
  }
  return instituteId;
}

/**
 * Lo que piden los documentos del Ministerio (nacionalidad, lugar y entidad de
 * nacimiento, tipo de cédula). Un campo que viene vacío se borra; uno que no
 * viene, no se toca. Si no dice el tipo de cédula y la cédula tiene la forma
 * de una escolar, se anota como escolar.
 */
export function datosParaElMinisterio(entrada: Record<string, unknown>, cedula?: string) {
  const datos: Record<string, string | null> = {};
  for (const campo of ['nacionalidad', 'lugarDeNacimiento', 'entidadDeNacimiento', 'tipoDeCedula'] as const) {
    if (!(campo in entrada)) continue;
    const v = typeof entrada[campo] === 'string' ? (entrada[campo] as string).trim() : '';
    datos[campo] = v || null;
  }
  if (!('tipoDeCedula' in entrada) && cedula && esCedulaEscolar(cedula)) datos.tipoDeCedula = 'ESCOLAR';
  return datos;
}
