import { FastifyRequest } from 'fastify';
import multer from 'fastify-multer';
import path from 'path';
import fs from 'fs';

// Crear directorio de uploads si no existe
const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'institute');
const faviconDir = path.join(uploadsDir, 'favicon');
const logosDir = path.join(uploadsDir, 'logos');

[uploadsDir, faviconDir, logosDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: ((req: FastifyRequest, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        // Determinar carpeta según el campo
        const dest = file.fieldname === 'favicon' ? faviconDir : logosDir;
        cb(null, dest);
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

// Middleware para eliminar archivo anterior
export const deleteOldFile = (filePath: string | null) => {
    if (!filePath) return;

    const cleanPath = filePath.replace(/^\/+/, '');
    const pathsToTry = [
        path.join(process.cwd(), cleanPath),
        path.join(process.cwd(), 'public', cleanPath),
    ];

    for (const p of pathsToTry) {
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
