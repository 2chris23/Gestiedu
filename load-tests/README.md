# Load Testing Suite – Instituto 5K

Suite completa de K6 para probar el sistema con **5,000 estudiantes, 10,000 tutores, 200 profesores y 50 admins**.

---

## 📁 Estructura

```
load-tests/
├── config.js                   # Helpers compartidos (login, headers, cache tracker)
│
├── basic-test-5k.js            # Test lectura masiva (4,500 VUs pico)
├── write-operations-test.js    # Test con escrituras reales (teachers/admins)
├── instituto-completo-5k.js    # Día escolar simulado 7AM-3PM (6,000 VUs)
├── stress-extreme-5k.js        # Stress hasta 15,000 VUs (punto de quiebre)
│
├── instituto-real.js           # Test previo (500 VUs)
├── basic-test.js               # Test previo básico
├── stress-test.js              # Stress previo
├── cache-test.js               # Validación de cache
│
├── generate-report.js          # Genera HTML con gráficas Chart.js
├── compare-results.js          # Compara dos ejecuciones
│
├── test-users-5k.csv           # Credenciales generadas por el seed
└── reports/                    # JSONs y HTMLs de resultados
```

---

## 🚀 Inicio Rápido

### 1. Instalar K6

```powershell
winget install k6 --source winget
# o
choco install k6
```

### 2. Levantar el backend

```powershell
cd apps/backend
npm run dev
# Verificar: http://localhost:3001/health → 200 OK
```

### 3. Generar datos de prueba

```powershell
# ⏱️ Tarda 8-15 minutos – genera 15,250 usuarios y 3M+ registros
npm run test:seed

# Limpiar datos existentes antes de re-sembrar
npm run test:seed:clean && npm run test:seed
```

El seed crea el instituto `test-load-5k` con:

| Entidad | Cantidad |
|---|---|
| Admins | 50 |
| Profesores | 200 |
| Estudiantes | 5,000 |
| Tutores | 10,000 |
| Aulas | 100 (10 grados × 10 secciones) |
| Materias | 12 por aula |
| **Lapsos** | **3 por año escolar** |
| Actividades | ~48,000 |
| Calificaciones | ~2,400,000 |
| Asistencias | ~600,000 |

---

## ▶️ Ejecutar Tests

### Test básico 5K (solo lectura)
```powershell
npm run test:load:basic:5k
# Es solo lectura: estudiantes, tutores y profesores leyendo datos
# Peak: 4,500 VUs | Duración: ~33 min
```

### Test con escrituras
```powershell
npm run test:load:write
# Profesores registran asistencia, crean actividades y calificaciones
# Peak: 4,675 VUs | Duración: ~20 min
```

### Día escolar completo (recomendado)
```powershell
npm run test:load:completo
# Simula 8 horas escolares en 45 minutos
# Peak: 6,000 VUs | Duración: ~47 min
```

### Stress extremo (⚠️ solo ambiente aislado)
```powershell
npm run test:load:stress
# 5 fases hasta 15,000 VUs - identifica punto de quiebre
# ⚠️ SATURARÁ el servidor. Nunca en producción.
```

### Con variables de entorno
```powershell
k6 run `
  --env API_URL=http://mi-servidor:3001 `
  --env INSTITUTE_SLUG=test-load-5k `
  load-tests/basic-test-5k.js
```

---

## 📊 Generar Reportes HTML

```powershell
# Test + reporte automático en un solo comando:
npm run test:load:basic:5k:report
npm run test:load:write:report
npm run test:load:completo:report
npm run test:load:stress:report

# Abrir reporte (Windows):
start load-tests\reports\basic-5k-latest-report.html
```

El reporte HTML incluye:
- ✅ Tabla métricas PASS/FAIL con objetivos
- 📈 Gráfica de response time (avg y p95 por minuto)
- 📈 Gráfica de VUs activos
- 🔝 Top 10 endpoints más lentos
- 💡 Recomendaciones automáticas

---

## 🔄 Comparar Resultados Entre Ejecuciones

```powershell
# 1. Guardar baseline (antes de un cambio)
k6 run --summary-export=load-tests/reports/baseline-summary.json load-tests/basic-test-5k.js

# 2. Hacer cambios en el código...

# 3. Guardar resultados actuales
k6 run --summary-export=load-tests/reports/current-summary.json load-tests/basic-test-5k.js

# 4. Comparar
npm run test:load:compare -- --baseline=load-tests/reports/baseline-summary.json --current=load-tests/reports/current-summary.json
```

---

## 📏 Criterios de Éxito

| Métrica | Objetivo | Crítico |
|---|---|---|
| p(95) response time | < 500ms | < 1,000ms |
| p(99) response time | < 1,000ms | < 2,000ms |
| Error rate | < 1% | < 5% |
| Cache hit rate | > 60% | > 40% |
| Throughput | > 2,000 req/s | > 500 req/s |
| Write error rate | < 0.5% | < 2% |

---

## 🔍 Métricas personalizadas K6

| Métrica | Descripción |
|---|---|
| `cache_hits` | Total hits de cache |
| `cache_misses` | Total misses de cache |
| `cache_hit_rate` | Tasa de hit (Rate) |
| `dashboard_duration` | p(95) del endpoint /dashboard |
| `write_operations_total` | Total operaciones de escritura |
| `write_operations_failed` | Escrituras fallidas |
| `cache_invalidations_triggered` | Invalidaciones de cache por teacher |
| `degradation_rate` | Requests > 1s (stress test) |
| `critical_rate` | Requests > 3s (stress test) |

---

## 🛠️ Troubleshooting

### CSV no encontrado
```
Error: cannot open load-tests/test-users-5k.csv
```
→ Ejecutar `npm run test:seed` primero

### Error de conexión al API
```
ERRO[0000] Request Failed
```
→ Verificar que el backend esté corriendo: `curl http://localhost:3001/health`

### Login falla masivamente
→ Verificar que el instituto `test-load-5k` existe: `npm run test:seed:clean && npm run test:seed`

### Stress test detiene el SO
→ Reducir tarjet de VUs en `stress-extreme-5k.js` (stages) antes de ejecutar

### Seed tarda más de 20 minutos
→ Normal con 2.4M calificaciones. Ejecutar con `--users` para solo crear usuarios:
```powershell
npx tsx apps/backend/src/scripts/seed-load-test.ts --users
```

---

## 🏗️ Arquitectura del año escolar en el seed

```
AcademicYear 2024-2025
├── Lapso 1: Sep 15 – Dic 13, 2024
├── Lapso 2: Ene 13 – Mar 28, 2025
└── Lapso 3: Abr 7 – Jun 27, 2025 ← activo

Por lapso: 10 actividades × 12 materias × 100 aulas = 12,000 actividades
Por lapso: 50 notas × 10 act. × 12 mat. × 100 aulas = 600,000 notas
Total notas: 600,000 × 3 lapsos = 1,800,000
```
