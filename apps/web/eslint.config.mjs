import coreWebVitals from 'eslint-config-next/core-web-vitals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'public/_shared/**',
    ],
  },
  ...coreWebVitals,
  {
    rules: {
      // Reglas nuevas de react-hooks v6 (análisis del React Compiler).
      // Señalan anti-patrones de rendimiento, no errores de runtime:
      // se dejan como warn mientras se refina el código en el rediseño de UI.
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },
];
