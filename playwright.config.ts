import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  /**
   * 45 s no llegaban.
   *
   * El sistema limita los intentos de entrar a diez por minuto y por cuenta, y
   * eso no se toca: es lo que frena a quien prueba contraseñas. Pero la tanda
   * entera entra muchas veces con el mismo administrador, así que de vez en
   * cuando a una prueba le toca **esperar a que se suelte la ventana** —hasta un
   * minuto— antes de poder empezar. Con 45 s de tope, esa prueba moría por
   * tiempo y parecía un fallo del producto.
   *
   * 90 s dejan sitio para la espera. Lo único que cuesta es que una prueba
   * colgada de verdad tarde el doble en darse por perdida.
   */
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
