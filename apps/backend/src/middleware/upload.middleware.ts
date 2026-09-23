import { FastifyRequest } from 'fastify';
import multer from 'fastify-multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'institute');
const faviconDir = path.join(uploadsDir, 'favicon');
const logosDir = path.join(uploadsDir, 'logos');

/**
 * La carpeta se crea cuando hace falta, no al cargar el archivo.
 *
 * Se creaba al arrancar, solo por importar este módulo (lo importa el
 * controlador de institutos para `deleteOldFile`). En el contenedor de
 * producción la aplicación corre sin permisos de root y `/app/public` no se
 * puede crear: el backend se caía al arrancar, antes de atender a nadie.
 */
function asegurarCarpeta(dir: string): string {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: ((req: FastifyRequest, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        // Determinar carpeta según el campo
        try {
            cb(null, asegurarCarpeta(file.fieldname === 'favicon' ? faviconDir : logosDir));
        } catch (error) {
            cb(error as Error, '');
        }
    }) as any,
    filename: ((req: FastifyRequest, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        // Generar nombre único: timestamp + extensión original
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }) as any
});

// Filtro de archivos
const fileFilter = (req: FastifyRequest, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
    // Tipos de archivo permitidos
    const allowedMimes = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/x-icon',
        'image/vnd.microsoft.icon'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido. Solo PNG, JPG, GIF e ICO.'), false);
    }
};

// Configuración de multer
export const upload: any = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB máximo
    },
    fileFilter: fileFilter as any
});

// Middleware para eliminar archivo anterior de forma segura (mitigación path traversal)
export const deleteOldFile = (filePath: string | null) => {
    if (!filePath || typeof filePath !== 'string') return;

    // Rechazar caracteres nulos o secuencias de escape de directorio
    if (filePath.includes('..') || filePath.includes('\0')) {
        console.warn('Intento de path traversal rechazado en deleteOldFile:', filePath);
        return;
    }

    const cleanPath = filePath.replace(/^[/\\]+/, '');

    const allowedBases = [
        path.resolve(process.cwd(), 'public', 'uploads'),
        path.resolve(process.cwd(), 'uploads'),
    ];

    const pathsToTry = [
        path.resolve(process.cwd(), cleanPath),
        path.resolve(process.cwd(), 'public', cleanPath),
    ];

    for (const p of pathsToTry) {
        // Verificar que la ruta resuelta resida estrictamente dentro de los directorios de uploads permitidos
        const isSafe = allowedBases.some(base => p === base || p.startsWith(base + path.sep));
        if (!isSafe) {
            continue;
        }

        if (fs.existsSync(p)) {
            try {
                fs.unlinkSync(p);
                break;
            } catch (error) {
                console.error('Error al eliminar archivo anterior:', error);
            }
        }
    }
};
