/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    // Una base de datos por archivo de pruebas (ver tests/jest.dbEnvironment.js)
    testEnvironment: '<rootDir>/tests/jest.dbEnvironment.js',
    globalSetup: '<rootDir>/tests/jest.globalSetup.js',
    globalTeardown: '<rootDir>/tests/jest.globalTeardown.js',
    setupFiles: ['<rootDir>/tests/jest.envSetup.js'],
    roots: ['<rootDir>/tests', '<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json', 'mjs'],
    transform: {
        '^.+\\.(t|j)sx?$': ['ts-jest', {
            isolatedModules: true,
            diagnostics: false,
        }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],
    coverageDirectory: 'coverage',
    testTimeout: 30000,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    // Tests de integración comparten la BD — ejecutar en serie para evitar FK violations
    runInBand: true,
    maxWorkers: 1,
    // Transformar paquetes ESM específicos
    transformIgnorePatterns: [
        'node_modules/(?!(@exodus|isomorphic-dompurify|jsdom|html-encoding-sniffer|whatwg-url|data-urls|minipass-fetch|parse5|formdata-node|node-fetch|fetch-blob|@nodesecure)/)'
    ],
};
