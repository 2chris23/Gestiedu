/**
 * jest.envSetup.js — MINIMAL VERSION
 *
 * Solo setea NODE_ENV=test para que prisma.ts plugin
 * no falle en modo tolerante.
 */
process.env.NODE_ENV = 'test';
