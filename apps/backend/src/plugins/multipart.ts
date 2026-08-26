import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyMultipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

// Función para asegurar que un directorio existe
const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const multipartPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Obtener la configuración de carga de archivos desde las variables de entorno
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10); // 5MB por defecto

  // Asegurar que el directorio de carga existe
  ensureDir(uploadDir);

  // Registrar el plugin de Multipart con las opciones configuradas
  await fastify.register(fastifyMultipart, {
    limits: {
      fieldNameSize: 100, // Tamaño máximo del nombre del campo
      fieldSize: 100, // Tamaño máximo del valor del campo
      fields: 10, // Número máximo de campos no-file
      fileSize: maxFileSize, // Tamaño máximo del archivo
      files: 5, // Número máximo de archivos
      headerPairs: 2000, // Número máximo de pares de cabecera
    },
  });

  // Decorar la instancia de Fastify con métodos para manejar archivos
  fastify.decorate('uploadFile', async function (file: any, options: any = {}) {
    const { tenantId, userId, customDir, customFilename } = options;

    // Determinar el directorio de destino
    let destDir = uploadDir;
    if (tenantId) {
      destDir = path.join(destDir, tenantId);
      ensureDir(destDir);
    }
    if (customDir) {
      destDir = path.join(destDir, customDir);
      ensureDir(destDir);
    }

    // Generar un nombre de archivo único si no se proporciona uno personalizado
    const filename = customFilename || `${randomUUID()}-${file.filename}`;
    const filepath = path.join(destDir, filename);

    // Guardar el archivo
    await pipeline(file.file, fs.createWriteStream(filepath));

    // Registrar la carga del archivo
    fastify.log.info(`File uploaded: ${filepath}`);

    // Devolver información sobre el archivo cargado
    return {
      filename,
      filepath,
      mimetype: file.mimetype,
      size: file.file.bytesRead,
      encoding: file.encoding,
      tenantId,
      userId,
      uploadedAt: new Date(),
    };
  });

  fastify.decorate('deleteFile', async function (filepath: string) {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      fastify.log.info(`File deleted: ${filepath}`);
      return true;
    }
    return false;
  });

  // Log de la configuración de Multipart
  fastify.log.info(`Multipart configured with upload dir: ${uploadDir}`);
  fastify.log.info(`Multipart configured with max file size: ${maxFileSize} bytes`);
};

export default fastifyPlugin(multipartPlugin);