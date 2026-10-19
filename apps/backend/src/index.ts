import { buildServer } from './server';
import { config } from './config/environment';
import { updateBackendConfig, markBackendStopped } from './utils/backend-config';
import { startStorageMonitor } from './jobs/monitor-storage.job';
import { startAllJobs } from './jobs/metrics-collector.job';
import { queNoSeMueraEnSilencio } from './utils/no-morir-en-silencio';
import { avisarSiNoCabenLasConexiones } from './config/database';

// Antes que nada: que una promesa rechazada no se lleve por delante al liceo
// entero sin dejar dicho qué pasó. Ver `utils/no-morir-en-silencio.ts`.
queNoSeMueraEnSilencio(markBackendStopped);

const start = async () => {
  const server = await buildServer();
  try {
    const PORT = Number(process.env.PORT) || 3001;
    // La cola de conexiones por aceptar: Node la deja en 511 y, al llenarse,
    // el sistema RECHAZA (ECONNREFUSED). Medido: 300 alumnos entrando a la
    // vez (900 conexiones) daban 63 rechazos. El sistema operativo la recorta
    // a su propio tope (somaxconn en Linux), así que pedir más no rompe nada.
    await server.listen({ port: PORT, host: '::', backlog: Number(process.env.COLA_DE_CONEXIONES) || 8192 });
    console.log(`Server listening on port ${PORT}`);

    // 📡 Comunicar al frontend en qué puerto estamos
    updateBackendConfig(PORT);

    // 📦 Iniciar job de monitoreo de almacenamiento (cads hora)
    startStorageMonitor();

    // 📊 Iniciar jobs de monitoreo: métricas cada 5 min + limpieza diaria de alertas
    startAllJobs();

    // Decir si las conexiones a la base dan para los liceos configurados. No
    // corta el arranque: lo deja dicho con el número antes de que alguien lo
    // descubra el día que entren 200 personas a la vez.
    void avisarSiNoCabenLasConexiones();

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
