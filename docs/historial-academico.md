# 📚 Sistema de Historial Académico Global

## Arquitectura de Datos

### Flujo de Información por Ciclo Escolar

```
Estudiante: Juan Pérez (ID: V12345678)
│
├─ Ciclo 2023-2024 (4to Grado)
│  ├─ StudentClassroom
│  │  ├─ classroomId: "4A-2023"
│  │  ├─ academicYearId: "2023-2024"
│  │  └─ isActive: false (ya terminó)
│  │
│  ├─ Calificaciones (Grades)
│  │  ├─ Matemáticas: 15.5
│  │  ├─ Lenguaje: 18.0
│  │  └─ Ciencias: 16.2
│  │
│  ├─ Asistencia
│  │  ├─ Total días: 180
│  │  ├─ Presente: 165
│  │  └─ Porcentaje: 91.7%
│  │
│  └─ AcademicRecord (Resumen Final)
│     ├─ finalAverage: 16.6
│     ├─ status: "PROMOTED"
│     └─ sectionSnapshot: "4to Grado A"
│
├─ Ciclo 2024-2025 (5to Grado)
│  ├─ StudentClassroom
│  │  ├─ classroomId: "5B-2024"
│  │  ├─ academicYearId: "2024-2025"
│  │  └─ isActive: false
│  │
│  ├─ Calificaciones
│  │  ├─ Matemáticas: 14.0
│  │  ├─ Lenguaje: 17.5
│  │  └─ Ciencias: 15.8
│  │
│  ├─ Asistencia
│  │  ├─ Total días: 180
│  │  ├─ Presente: 170
│  │  └─ Porcentaje: 94.4%
│  │
│  └─ AcademicRecord
│     ├─ finalAverage: 15.8
│     ├─ status: "PROMOTED"
│     └─ sectionSnapshot: "5to Grado B"
│
└─ Ciclo 2025-2026 (6to Grado) ⭐ ACTUAL
   ├─ StudentClassroom
   │  ├─ classroomId: "6A-2025"
   │  ├─ academicYearId: "2025-2026"
   │  └─ isActive: true (ciclo actual)
   │
   ├─ Calificaciones (en progreso)
   │  ├─ Matemáticas: 16.0
   │  ├─ Lenguaje: 18.5
   │  └─ Ciencias: 17.2
   │
   ├─ Asistencia (en progreso)
   │  ├─ Total días: 45
   │  ├─ Presente: 43
   │  └─ Porcentaje: 95.6%
   │
   └─ AcademicRecord: null (aún no finalizado)
```

---

## Estructura de Respuesta del Endpoint

### GET `/api/students/:id/complete-history`

```json
{
  "student": {
    "id": "V12345678",
    "fullName": "Juan Pérez",
    "email": "juan.perez@example.com",
    "studentCode": "EST-001",
    "birthDate": "2012-05-15",
    "joinDate": "2023-09-01"
  },
  
  "globalStats": {
    "totalYears": 3,
    "globalAverage": 16.1,
    "totalSubjects": 9,
    "totalActivities": 127,
    "totalObservations": 5,
    "totalAttendanceDays": 405,
    "globalAttendancePercentage": 94
  },
  
  "yearlyHistory": [
    {
      "academicYear": {
        "id": "ay-2025",
        "name": "2025-2026",
        "startDate": "2025-09-01",
        "endDate": "2026-07-15",
        "status": "ACTIVE"
      },
      "enrollment": {
        "classroom": {
          "id": "6A-2025",
          "name": "6to Grado A",
          "grade": 6,
          "section": "A"
        },
        "teacher": {
          "fullName": "María González"
        },
        "enrollmentDate": "2025-09-01",
        "isActive": true
      },
      "performance": {
        "average": 17.2,
        "subjects": [
          {
            "subjectId": "math-001",
            "subjectName": "Matemáticas",
            "subjectColor": "#FF6B6B",
            "average": 16.0,
            "totalActivities": 15,
            "status": "Aprobado"
          },
          {
            "subjectId": "lang-001",
            "subjectName": "Lenguaje",
            "subjectColor": "#4ECDC4",
            "average": 18.5,
            "totalActivities": 12,
            "status": "Aprobado"
          }
        ],
        "failedSubjects": 0,
        "totalSubjects": 3
      },
      "attendance": {
        "totalDays": 45,
        "presentDays": 43,
        "lateDays": 1,
        "absentDays": 1,
        "percentage": 96
      },
      "finalRecord": null
    },
    {
      "academicYear": {
        "id": "ay-2024",
        "name": "2024-2025",
        "status": "COMPLETED"
      },
      "enrollment": { ... },
      "performance": {
        "average": 15.8,
        "subjects": [ ... ],
        "failedSubjects": 0,
        "totalSubjects": 3
      },
      "attendance": {
        "totalDays": 180,
        "presentDays": 170,
        "percentage": 94
      },
      "finalRecord": {
        "finalAverage": 15.8,
        "status": "PROMOTED",
        "sectionSnapshot": "5to Grado B"
      }
    }
  ],
  
  "observations": [
    {
      "id": "obs-001",
      "title": "Excelente participación",
      "type": "POSITIVE",
      "date": "2025-10-15",
      "createdBy": "María González",
      "createdByRole": "TEACHER"
    }
  ]
}
```

---

## Queries SQL Optimizadas

### 1. Calificaciones por Año
```sql
SELECT 
  ay.id as academicYearId,
  ay.name as academicYearName,
  s.name as subjectName,
  AVG(g.score) as averageScore,
  COUNT(DISTINCT g.activityId) as totalActivities
FROM grades g
INNER JOIN subjects s ON s.id = g.subjectId
INNER JOIN periods p ON p.id = g.periodId
INNER JOIN academic_years ay ON ay.id = p.academicYearId
WHERE g.studentId = ?
GROUP BY ay.id, s.id
ORDER BY ay.startDate DESC
```

### 2. Asistencia por Año
```sql
SELECT 
  ay.name as academicYearName,
  COUNT(*) as totalDays,
  COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as presentDays,
  (COUNT(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0 / COUNT(*)) as percentage
FROM attendance_records ar
INNER JOIN classrooms c ON c.id = ar.classroomId
INNER JOIN academic_years ay ON ay.id = c.academicYearId
WHERE ar.studentId = ?
GROUP BY ay.id
```

### 3. Estadísticas Globales
```sql
SELECT 
  COUNT(DISTINCT g.id) as totalGrades,
  AVG(g.score) as globalAverage,
  COUNT(DISTINCT g.subjectId) as totalSubjects,
  COUNT(DISTINCT g.activityId) as totalActivities
FROM grades g
WHERE g.studentId = ?
```

---

## Casos de Uso

### 1. Ver Progreso Histórico
```typescript
// Frontend
const { data: history } = useQuery({
  queryKey: ['student-history', studentId],
  queryFn: () => api.get(`/students/${studentId}/complete-history`)
});

// Mostrar gráfico de evolución
const averagesByYear = history.yearlyHistory.map(y => ({
  year: y.academicYear.name,
  average: y.performance.average
}));
```

### 2. Comparar Rendimiento Entre Años
```typescript
const currentYear = history.yearlyHistory[0];
const previousYear = history.yearlyHistory[1];

const improvement = currentYear.performance.average - previousYear.performance.average;
console.log(`Mejora: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}`);
```

### 3. Generar Reporte Académico Completo
```typescript
// PDF con todo el historial
const report = {
  student: history.student,
  globalStats: history.globalStats,
  yearlyPerformance: history.yearlyHistory.map(y => ({
    year: y.academicYear.name,
    section: y.enrollment.classroom.name,
    average: y.performance.average,
    attendance: y.attendance.percentage
  }))
};
```

---

## Ventajas del Diseño

### ✅ Separación de Datos Activos vs Históricos
- `isActive: true` → Datos del ciclo actual (modificables)
- `isActive: false` → Datos históricos (solo lectura)

### ✅ Resumen Final Inmutable
- `AcademicRecord` guarda el estado final del año
- No se modifica aunque cambien las calificaciones actuales

### ✅ Consultas Eficientes
- Agregaciones SQL en lugar de procesamiento JS
- Datos agrupados por año académico
- Índices en `studentId` y `academicYearId`

### ✅ Trazabilidad Completa
- Historial de todas las secciones
- Registro de todos los profesores
- Observaciones con fecha y autor

---

## Consideraciones de Performance

### Para Estudiantes con Muchos Años
Si un estudiante tiene 10+ años de historial:

```typescript
// Opción 1: Paginación por año
GET /students/:id/history?years=2025-2026,2024-2025

// Opción 2: Solo resúmenes
GET /students/:id/history/summary

// Opción 3: Año específico
GET /students/:id/history/year/2025-2026
```

### Caché Recomendado
```typescript
// React Query con staleTime largo para datos históricos
useQuery({
  queryKey: ['student-history', studentId],
  queryFn: fetchHistory,
  staleTime: 10 * 60 * 1000, // 10 minutos (datos históricos no cambian)
  cacheTime: 30 * 60 * 1000  // 30 minutos
});
```

---

## Próximos Pasos

1. ✅ Endpoint creado: `student-history.controller.ts`
2. [ ] Agregar ruta en el router
3. [ ] Crear tipos TypeScript para el frontend
4. [ ] Implementar componente de visualización
5. [ ] Agregar gráficos de evolución

---

**¿Necesitas que implemente alguna funcionalidad adicional para el historial académico?**
