#!/usr/bin/env node

/**
 * Script para copiar archivos compartidos desde el workspace shared
 * Este script se ejecuta antes de dev y build para asegurar que los
 * archivos compartidos estén disponibles en el frontend
 */

const fs = require('fs');
const path = require('path');

// Directorios
const sharedDir = path.join(__dirname, '../../shared');
const targetDir = path.join(__dirname, '../src/shared');

// Verificar si existe el directorio shared
if (!fs.existsSync(sharedDir)) {
    console.log('⚠️  Directorio shared no encontrado, saltando copia...');
    process.exit(0);
}

// Crear directorio de destino si no existe
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Copiar archivos (si hay alguno)
try {
    const files = fs.readdirSync(sharedDir);

    if (files.length === 0) {
        console.log('✅ No hay archivos compartidos para copiar');
        process.exit(0);
    }

    files.forEach(file => {
        const srcFile = path.join(sharedDir, file);
        const destFile = path.join(targetDir, file);

        // Solo copiar archivos, no directorios
        if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, destFile);
            console.log(`✅ Copiado: ${file}`);
        }
    });

    console.log('✅ Archivos compartidos copiados exitosamente');
} catch (error) {
    console.error('❌ Error copiando archivos compartidos:', error.message);
    // No fallar el build por esto
    process.exit(0);
}
