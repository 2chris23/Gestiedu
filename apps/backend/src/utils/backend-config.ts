/**
 * 📡 Backend Configuration Writer
 * 
 * Este módulo se encarga de escribir la configuración del backend
 * en un archivo compartido que el frontend puede leer.
 * 
 * El backend "le dice" al frontend dónde está corriendo.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger';

interface BackendConfig {
    port: number;
    host: string;
    protocol: 'http' | 'https';
    apiUrl: string;
    status: 'running' | 'stopped';
    lastStarted: string | null;
    version: string;
}

const CONFIG_PATH = path.join(__dirname, '../../../shared/backend-config.json');

/**
 * Actualiza el archivo de configuración compartida
 * El backend llama a esta función al iniciar
 */
export function updateBackendConfig(port: number, host: string = 'localhost'): void {
    const config: BackendConfig = {
        port,
        host,
        protocol: 'http',
        apiUrl: `http://${host}:${port}/api`,
        status: 'running',
        lastStarted: new Date().toISOString(),
        version: '1.0.0',
    };

    try {
        // Asegurar que el directorio existe
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Escribir configuración
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        logger.info('Configuración del backend actualizada:');
        logger.info(`   Puerto: ${port}`);
        logger.info(`   API URL: ${config.apiUrl}`);
        logger.info(`   Archivo: ${CONFIG_PATH}`);
    } catch (error) {
        logger.error('Error al actualizar configuración del backend:', error);
    }
}

/**
 * Marca el backend como detenido
 * Se llama cuando el servidor se cierra
 */
export function markBackendStopped(): void {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            currentConfig.status = 'stopped';
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf-8');
            logger.info('Backend marcado como detenido');
        }
    } catch (error) {
        logger.error('Error al marcar backend como detenido:', error);
    }
}

/**
 * Lee la configuración actual del backend
 */
export function readBackendConfig(): BackendConfig | null {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
        return null;
    } catch (error) {
        logger.error('Error al leer configuración del backend:', error);
        return null;
    }
}
