import { config } from 'dotenv';
import { TextEncoder, TextDecoder } from 'util';

// Cargar variables de entorno de test
config({ path: '.env.test' });

// Configurar variables de entorno para tests
(process.env as any).NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key';

// Polyfill para TextEncoder/TextDecoder (por si acaso)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock de Redis
jest.mock('ioredis');
