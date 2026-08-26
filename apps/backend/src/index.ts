import { buildServer } from './server';
import { config } from './config/environment';
import { updateBackendConfig, markBackendStopped } from './utils/backend-config';
import { startStorageMonitor } from './jobs/monitor-storage.job';

const start = async () => {
  const server = await buildServer();
  try {
    const PORT = Number(process.env.PORT) || 3001;
    await server.listen({ port: PORT, host: '::' });
    console.log(`Server listening on port ${PORT}`);

    // 📡 Comunicar al frontend en qué puerto estamos
    updateBackendConfig(PORT);

    // 📦 Iniciar job de monitoreo de almacenamiento (cads hora)
    startStorageMonitor();

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo servidor...');
  markBackendStopped();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Deteniendo servidor...');
  markBackendStopped();
  process.exit(0);
});

start();
// trigger restart
