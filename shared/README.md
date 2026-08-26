# 📡 Sistema de Configuración Compartida

Este directorio contiene archivos de configuración compartidos entre el frontend y el backend.

## Archivos

### `backend-config.json`

Archivo que el backend actualiza automáticamente al iniciar para comunicarle al frontend en qué puerto está corriendo.

**Estructura**:
```json
{
  "port": 3001,
  "host": "localhost",
  "protocol": "http",
  "apiUrl": "http://localhost:3001/api",
  "status": "running",
  "lastStarted": "2026-01-05T20:00:00Z",
  "version": "1.0.0"
}
```

## Cómo Funciona

1. **Backend** (`apps/backend/src/index.ts`):
   - Al iniciar, escribe su configuración en `backend-config.json`
   - Actualiza el estado a `"running"`
   - Al detenerse, actualiza el estado a `"stopped"`

2. **Frontend** (`apps/web/src/lib/axios.ts`):
   - Lee `backend-config.json` para saber dónde está el backend
   - Usa la URL del API especificada en el archivo
   - Si no puede leer el archivo, usa puerto 3001 por defecto

## Ventajas

- ✅ El backend "le dice" al frontend dónde está
- ✅ No hay "adivinanzas" de puertos
- ✅ Funciona incluso si el puerto cambia
- ✅ Simple y directo
