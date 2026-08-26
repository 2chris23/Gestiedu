/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
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
    ];
  },

  // Headers para permitir acceso desde subdominios de localhost en desarrollo
  async headers() {
    if (process.env.NODE_ENV === 'development') {
      return [
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
    return [];
  },

  // Nota: la copia de shared/ a public/_shared la realiza scripts/copy-shared.js
  // (se ejecuta en los scripts dev/build). No se usa plugin de webpack porque
  // el build de Next 16 usa Turbopack, que ignora la configuración de webpack.
};

module.exports = nextConfig;
