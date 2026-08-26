// Type declarations for fastify-multer
import 'fastify';

declare module 'fastify' {
    interface FastifyRequest {
        file?: Express.Multer.File;
        files?: {
            [fieldname: string]: Express.Multer.File[];
        } | Express.Multer.File[];
    }
}

declare global {
    namespace Express {
        namespace Multer {
            interface File {
                fieldname: string;
                originalname: string;
                encoding: string;
                mimetype: string;
                size: number;
                destination: string;
                filename: string;
                path: string;
                buffer: Buffer;
            }
        }
    }
}

export { };
