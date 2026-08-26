#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Configurando el Backend del Sistema de Gestión Escolar...\n');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function logStep(step, message) {
  log(`${step}. ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Verificar si un comando existe
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Ejecutar comando
function runCommand(command, description) {
  try {
    log(`Ejecutando: ${command}`, 'yellow');
    execSync(command, { stdio: 'inherit' });
    logSuccess(`${description} completado`);
  } catch (error) {
    logError(`Error en ${description}: ${error.message}`);
    process.exit(1);
  }
}

// Crear archivo .env si no existe
function createEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      logSuccess('.env creado desde .env.example');
      logWarning('¡IMPORTANTE! Edita el archivo .env con tus configuraciones reales');
    } else {
      // Crear .env básico
      const envContent = `# Configuración del entorno
NODE_ENV=development
PORT=3001

# Base de datos PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/sistema_gestion_escolar?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=desarrollo_jwt_secret_super_seguro_de_al_menos_32_caracteres_no_usar_en_produccion
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=60000

# Archivos
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Logging
LOG_LEVEL=info
`;
      fs.writeFileSync(envPath, envContent);
      logSuccess('.env creado con configuración básica');
      logWarning('¡IMPORTANTE! Edita el archivo .env con tus configuraciones reales');
    }
  } else {
    logInfo('.env ya existe');
  }
}

// Verificar dependencias del sistema
function checkSystemDependencies() {
  logStep(1, 'Verificando dependencias del sistema');
  
  const dependencies = [
    { name: 'node', version: '--version', required: '>=18.0.0' },
    { name: 'npm', version: '--version', required: '>=8.0.0' },
  ];
  
  const optionalDependencies = [
    { name: 'docker', version: '--version', description: 'Para usar Docker' },
    { name: 'psql', version: '--version', description: 'Cliente de PostgreSQL' },
    { name: 'redis-cli', version: '--version', description: 'Cliente de Redis' }
  ];
  
  dependencies.forEach(dep => {
    if (commandExists(dep.name)) {
      logSuccess(`${dep.name} está instalado`);
    } else {
      logError(`${dep.name} NO está instalado (requerido: ${dep.required})`);
      process.exit(1);
    }
  });
  
  optionalDependencies.forEach(dep => {
    if (commandExists(dep.name)) {
      logSuccess(`${dep.name} está instalado`);
    } else {
      logWarning(`${dep.name} no está instalado (${dep.description})`);
    }
  });
}

// Instalar dependencias de npm
function installDependencies() {
  logStep(2, 'Instalando dependencias de Node.js');
  
  if (!fs.existsSync('package.json')) {
    logError('No se encontró package.json');
    process.exit(1);
  }
  
  runCommand('npm install', 'Instalación de dependencias');
}

// Configurar base de datos
function setupDatabase() {
  logStep(3, 'Configurando base de datos');
  
  // Verificar que Prisma esté instalado
  if (!fs.existsSync('node_modules/.bin/prisma')) {
    logError('Prisma no está instalado');
    process.exit(1);
  }
  
  // Generar cliente de Prisma
  runCommand('npx prisma generate', 'Generación del cliente Prisma');
  
  logInfo('Para completar la configuración de la base de datos, ejecuta:');
  logInfo('1. npx prisma db push    (para crear las tablas)');
  logInfo('2. npx prisma db seed    (para insertar datos iniciales)');
}

// Crear directorios necesarios
function createDirectories() {
  logStep(4, 'Creando directorios necesarios');
  
  const directories = [
    'uploads',
    'uploads/avatars',
    'uploads/documents',
    'uploads/backups',
    'uploads/temp',
    'logs',
    'dist'
  ];
  
  directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logSuccess(`Directorio creado: ${dir}`);
    } else {
      logInfo(`Directorio ya existe: ${dir}`);
    }
  });
}

// Verificar configuración
function verifyConfiguration() {
  logStep(5, 'Verificando configuración');
  
  // Verificar .env
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const requiredVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'REDIS_HOST',
      'CORS_ORIGIN'
    ];
    
    const missingVars = requiredVars.filter(varName => 
      !envContent.includes(`${varName}=`)
    );
    
    if (missingVars.length > 0) {
      logWarning(`Variables faltantes en .env: ${missingVars.join(', ')}`);
    } else {
      logSuccess('Todas las variables requeridas están configuradas');
    }
  } else {
    logError('Archivo .env no encontrado');
  }
  
  // Verificar estructura de archivos importantes
  const importantFiles = [
    'src/server.ts',
    'src/config/database.ts',
    'src/config/redis.ts',
    'src/prisma/schema.prisma'
  ];
  
  importantFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, file))) {
      logSuccess(`Archivo encontrado: ${file}`);
    } else {
      logError(`Archivo faltante: ${file}`);
    }
  });
}

// Mostrar próximos pasos
function showNextSteps() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🎉 ¡CONFIGURACIÓN INICIAL COMPLETADA!', 'green');
  log('='.repeat(60), 'cyan');
  
  log('\n📋 PRÓXIMOS PASOS:', 'bright');
  
  log('\n1. 🔧 Configurar base de datos:', 'yellow');
  log('   - Asegúrate de tener PostgreSQL corriendo');
  log('   - Edita DATABASE_URL en .env con tus credenciales');
  log('   - Ejecuta: npm run db:setup');
  
  log('\n2. 🔑 Configurar Redis (opcional para desarrollo):', 'yellow');
  log('   - Instala Redis: brew install redis (macOS) o apt install redis (Ubuntu)');
  log('   - Inicia Redis: redis-server');
  log('   - O edita REDIS_HOST en .env si usas una instancia remota');
  
  log('\n3. 📧 Configurar Email (opcional):', 'yellow');
  log('   - Edita las variables SMTP_* en .env');
  log('   - Para Gmail, usa contraseñas de aplicación');
  
  log('\n4. 🚀 Iniciar el servidor:', 'yellow');
  log('   - Desarrollo: npm run dev');
  log('   - Producción: npm run build && npm start');
  
  log('\n5. 📚 Documentación API:', 'yellow');
  log('   - Swagger UI: http://localhost:3001/documentation');
  log('   - Prisma Studio: npm run db:studio');
  
  log('\n6. 🧪 Ejecutar tests:', 'yellow');
  log('   - Tests unitarios: npm test');
  log('   - Tests con cobertura: npm run test:coverage');
  
  log('\n7. 🐳 Docker (opcional):', 'yellow');
  log('   - docker-compose up -d (servicios)');
  log('   - docker-compose -f docker-compose.yml up');
  
  log('\n📖 RECURSOS ÚTILES:', 'bright');
  log('   - Documentación: /docs/');
  log('   - Ejemplos: /docs/api/examples.md');
  log('   - Troubleshooting: /docs/development/troubleshooting.md');
  
  log('\n🔗 URLs IMPORTANTES (cuando el servidor esté corriendo):', 'bright');
  log('   - API: http://localhost:3001');
  log('   - Health Check: http://localhost:3001/health');
  log('   - Swagger: http://localhost:3001/documentation');
  
  log('\n💡 TIPS:', 'bright');
  log('   - Usa npm run dev para desarrollo con hot reload');
  log('   - Revisa los logs en consola para errores');
  log('   - El archivo .env es ignorado por git por seguridad');
  
  log('\n🆘 Si tienes problemas:', 'bright');
  log('   - Verifica que PostgreSQL y Redis estén corriendo');
  log('   - Revisa la configuración en .env');
  log('   - Consulta /docs/development/troubleshooting.md');
  
  log('\n' + '='.repeat(60), 'cyan');
}

// Función principal
function main() {
  try {
    checkSystemDependencies();
    createEnvFile();
    installDependencies();
    createDirectories();
    setupDatabase();
    verifyConfiguration();
    showNextSteps();
  } catch (error) {
    logError(`Error durante la configuración: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = {
  main,
  checkSystemDependencies,
  installDependencies,
  setupDatabase,
  createDirectories,
  verifyConfiguration,
};
