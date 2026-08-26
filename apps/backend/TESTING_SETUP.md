# Instalación de Dependencias de Testing

## Comando de Instalación

```bash
cd apps/backend
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest jest-mock-extended
```

## Dependencias Instaladas

- **jest**: Framework de testing
- **@types/jest**: Tipos de TypeScript para Jest
- **ts-jest**: Preset de Jest para TypeScript
- **supertest**: Testing de APIs HTTP
- **@types/supertest**: Tipos de TypeScript para Supertest
- **jest-mock-extended**: Mocking avanzado para TypeScript

## Verificación

Después de instalar, verificar que aparezcan en `package.json`:

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11",
    "ts-jest": "^29.1.1",
    "supertest": "^6.3.3",
    "@types/supertest": "^6.0.2",
    "jest-mock-extended": "^3.0.5"
  }
}
```
