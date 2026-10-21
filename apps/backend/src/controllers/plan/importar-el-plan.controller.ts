import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { AppErrors } from '../../middleware/error.middleware';
import * as mammoth from 'mammoth';
import { revisarZip, ZipPeligroso } from '../../utils/zip-seguro';
import { leerPlanDeWord } from '../../services/importar-plan-de-word';

// ============================================================
// Import Word Document Parsing
// ============================================================
export async function parseWordFile(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await request.file();
    if (!data) {
      throw AppErrors.BadRequest('No se ha subido ningún archivo');
    }

    // SEGURIDAD: Validar extensión .docx (parser-docx-memory-exhaustion-eval-plan)
    if (!data.filename || !data.filename.toLowerCase().endsWith('.docx')) {
      throw AppErrors.BadRequest('Solo se admiten documentos en formato Word (.docx)');
    }

    const buffer = await data.toBuffer();

    // SEGURIDAD: Limitar tamaño del archivo a 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      throw AppErrors.BadRequest('El documento excede el tamaño máximo permitido (2MB)');
    }

    // SEGURIDAD: Validar cabecera mágica PKZip (0x50, 0x4B, 0x03, 0x04)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw AppErrors.BadRequest('El archivo subido no es un documento .docx válido');
    }

    // SEGURIDAD: 2 MB comprimidos pueden ser gigabytes al abrirlos, y mammoth
    // lo descomprime entero en memoria (bomba zip). Se revisa antes, con tope.
    try {
      revisarZip(buffer);
    } catch (e) {
      if (e instanceof ZipPeligroso) throw AppErrors.BadRequest(`El documento no se puede abrir: ${e.message}`);
      throw e;
    }

    const result = await mammoth.convertToHtml({ buffer });
    let leido;
    try {
      leido = leerPlanDeWord(result.value);
    } catch (e: any) {
      if (e?.message === 'DEMASIADAS_FILAS') throw AppErrors.BadRequest('El documento contiene demasiadas filas en la tabla (máximo 500)');
      throw e;
    }
    if (!leido.filas.length) {
      throw AppErrors.BadRequest('No se encontró la tabla del plan: hace falta una fila de títulos (Tema generador, Actividad, Técnica, Instrumento, Criterios, Ponderación…)');
    }
    // `rows` se queda por compatibilidad: las filas en orden, sin su semana.
    const rows = leido.filas.map((f) => f.datos);
    return reply.send({ success: true, rows, filas: leido.filas, metadatos: leido.metadatos });
  } catch (error: any) {
    logger.error('Error al parsear documento Word', { error: error.message });
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    return reply.status(500).send({ error: 'Error procesando el archivo Word. Asegúrate de que no esté dañado y contenga una tabla.' });
  }
}
