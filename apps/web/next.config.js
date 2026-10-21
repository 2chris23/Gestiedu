/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Las dos pelotitas de desarrollo, fuera del pulgar.
   *
   * El indicador de Next se pinta abajo a la izquierda y las herramientas de
   * React Query abajo a la derecha: justo encima de la barra de tareas del
   * teléfono, tapando «Inicio» y «Horarios». Probando en un móvil parecía que
   * la app estuviera mal hecha. Esto es solo de desarrollo —en el liceo no
   * existe ninguna de las dos—, pero estorbaba justo donde se prueba.
   */
  devIndicators: false,
  transpilePackages: ['@repo/ui'],

  // Permite subdominios *.localhost en desarrollo y dominios de túnel público
  allowedDevOrigins: [
    '*.localhost',
    'localhost',
    '*.localhost:3000',
    'super-admin.localhost',
    'super-admin.localhost:3000',
    'superadmin.localhost',
    'superadmin.localhost:3000',
    '*.lhr.life',
    '*.localhost.run',
    '*.localtunnel.me',
    '*.ngrok-free.app',
    '*.trycloudflare.com',
    '*.pinggy.link',
    '*.pinggy.io',
    '*.ts.net',
    /**
     * Y la red de casa, para probar en un teléfono de verdad (`npm run
     * telefono`). Sin esto, el servidor de desarrollo corta lo que le pide una
     * dirección que no sea `localhost` —y desde el móvil, TODO lo es—: la app
     * se quedaba en blanco sin decir por qué. Es solo de desarrollo; en el
     * servidor del liceo esta lista no pinta nada.
     */
    '192.168.*.*',
    '10.*.*.*',
    '172.*.*.*',
  ],

  // Configurar dominios permitidos para imágenes
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
    // Límite del caché de disco del optimizador de imágenes (mitiga crecimiento no acotado)
    minimumCacheTTL: 60 * 60 * 24,
    maximumDiskCacheSize: 250 * 1024 * 1024, // 250 MB
  },

  // Configurar rewrites para servir archivos de la carpeta shared y API
  async rewrites() {
    // Backend al que se proxifica /api/* (configurable para entornos e2e/CI)
    // `API_DEL_SERVIDOR`: por dónde llega ESTE servidor a los datos cuando el
    // navegador los pide por otra dirección (el túnel, `npm run tunel`: el
    // navegador pide a `https://<pc>.ts.net/api` y aquí se reenvía al 3001;
    // sin esto se reenviaba a sí mismo, en bucle).
    const apiUrl = process.env.API_DEL_SERVIDOR || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const backendBase = apiUrl.replace(/\/api\/?$/, '');
    return [
      {
        source: '/shared/:path*',
        destination: '/_shared/:path*',
      },
      {
        source: '/api/:path*',
        destination: `${backendBase}/api/:path*`, // Proxy to backend
      },
      {
        source: '/uploads/:path*',
        destination: `${backendBase}/uploads/:path*`, // Proxy uploads to backend
      },
    ];
  },

  /**
   * LAS PANTALLAS NO SE DEJAN METER DENTRO DE OTRA PÁGINA
   *
   * La API ya llevaba estas cabeceras (helmet); las pantallas, ninguna. Sin
   * ellas, cualquier página podía poner el login del liceo dentro de un marco
   * invisible y hacer que la gente escribiera su clave creyendo que estaba en
   * otra cosa (clickjacking). Van en TODAS las rutas, en desarrollo también:
   * así las pruebas miden lo mismo que se despliega (SEG-WEB-01).
   *
   * La cámara (escanear el QR de asistencia) y la ubicación (el faro) solo
   * para la propia app; micrófono, pagos y USB, para nadie.
   */
  poweredByHeader: false,

  async headers() {
    const seguridad = [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()',
          },
        ],
      },
      // El panel también: la precarga ya no abre pantallas en un marco
      // oculto (baja un paquete, `lib/precarga.ts`), así que nadie, ni la
      // propia web, necesita enmarcarlo.
    ];
    // Acceso desde subdominios de localhost en desarrollo
    if (process.env.NODE_ENV === 'development') {
      return [
        ...seguridad,
        {
          source: '/api/:path*',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,PATCH,OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Institute-Slug' },
          ],
        },
      ];
    }
    return seguridad;
  },

  // Nota: la copia de shared/ a public/_shared la realiza scripts/copy-shared.js
  // (se ejecuta en los scripts dev/build). No se usa plugin de webpack porque
  // el build de Next 16 usa Turbopack, que ignora la configuración de webpack.
};

module.exports = nextConfig;
