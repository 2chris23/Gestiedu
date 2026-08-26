import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const WEB_PORT = process.env.E2E_WEB_PORT || '3000';
const BACKEND_PORT = process.env.E2E_BACKEND_PORT || '3001';
const backendBase = `http://localhost:${BACKEND_PORT}`;
const webBase = `http://localhost:${WEB_PORT}`;

const DB_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://e2e_user:e2e_password@localhost:5432/gestion_e2e';
const PLATFORM_DB_URL =
  process.env.E2E_PLATFORM_DATABASE_URL ||
  'postgresql://e2e_user:e2e_password@localhost:5432/gestion_e2e_platform';
const REDIS_URL = process.env.E2E_REDIS_URL || 'redis://localhost:6379';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: webBase,
    navigationTimeout: 60000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd ../backend && npx tsx src/index.ts',
      url: `${backendBase}/documentation/json`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: BACKEND_PORT,
        DATABASE_URL: DB_URL,
        PLATFORM_DATABASE_URL: PLATFORM_DB_URL,
        REDIS_URL,
        JWT_SECRET: 'e2e_secret_jwt_key_for_tests_more_than_32_characters_long',
        JWT_EXPIRES_IN: '1h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        CORS_ORIGIN: webBase,
        LOG_LEVEL: 'warn',
        UPLOAD_DIR: './uploads',
        MAX_FILE_SIZE: '5242880',
      },
    },
    {
      command: `node scripts/copy-shared.js && npx next dev -p ${WEB_PORT}`,
      url: `${webBase}/superadmin/login`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: `${backendBase}/api`,
        PORT: WEB_PORT,
      },
    },
  ],
});
