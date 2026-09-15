import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  TENANT_SLUG,
  loginApi,
  queryTenantDb,
  captureEvidence,
} from './helpers';

test.describe('Ciclos de Vida, Recreación de Entidades y Estados de Usuario', () => {
  let adminToken: string;
  const generateTestCedula = () => `V-${Math.floor(10000000 + Math.random() * 89999999)}`;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;
  });

  // =========================================================================
  // REC-01: Estudiante - Cascada limpia y recreación exacta
  // =========================================================================
  test('REC-01: Estudiante - Crear, Asignar Notas y Asistencias, Eliminar en Cascada y Recrear', async ({}, testInfo) => {
    const testCedula = generateTestCedula();
    const testEmail = `est_rec_${Date.now()}@testing.edu.ve`;

    // 1. Obtener aula, periodo y materia para crear datos relacionados
    const classroomRes = await queryTenantDb(`
      SELECT c.id as "classroomId", p.id as "periodId", s.id as "subjectId", u.id as "teacherId", ay.id as "academicYearId"
      FROM classrooms c
      JOIN academic_years ay ON c."academicYearId" = ay.id
      JOIN periods p ON p."academicYearId" = ay.id
      JOIN classroom_subjects cs ON cs."classroomId" = c.id
      JOIN subjects s ON cs."subjectId" = s.id
      JOIN users u ON cs."teacherId" = u.id
      WHERE ay.status = 'ACTIVE'
      LIMIT 1
    `);

    expect(classroomRes.length).toBeGreaterThan(0);
    const { classroomId, periodId, subjectId, teacherId, academicYearId } = classroomRes[0];

    try {
      // 2. Crear estudiante inicial
      const createRes = await axios.post(
        `${API_BASE}/users`,
        {
          id: testCedula,
          email: testEmail,
          firstName: 'Estudiante',
          lastName: 'Recreacion',
          role: 'STUDENT',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);

      // 3. Crear datos relacionados (Inscripción, Calificación, Asistencia)
      await queryTenantDb(
        `INSERT INTO student_classrooms (id, "studentId", "classroomId", "academicYearId", "enrollmentDate", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), true, NOW(), NOW())`,
        [`sc_${Date.now()}`, testCedula, classroomId, academicYearId]
      );

      // Crear actividad de prueba para enlazar la nota
      const actRes = await queryTenantDb(
        `INSERT INTO activities (id, title, type, scope, "startDate", "dueDate", "maxGrade", weight, "isActive", "createdBy", "createdAt", "updatedAt", "classroomId", "subjectId", "periodId")
         VALUES ($1, $2, 'TAREA', 'CLASSROOM', NOW(), NOW() + interval '7 days', 20, 1, true, $3, NOW(), NOW(), $4, $5, $6)
         RETURNING id`,
        [`act_rec_${Date.now()}`, 'Actividad REC-01', teacherId, classroomId, subjectId, periodId]
      );
      const activityId = actRes[0].id;

      await queryTenantDb(
        `INSERT INTO grades (id, score, "studentId", "activityId", "periodId", "subjectId", "teacherId", "createdAt", "updatedAt")
         VALUES ($1, 18.5, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [`gr_${Date.now()}`, testCedula, activityId, periodId, subjectId, teacherId]
      );

      await queryTenantDb(
        `INSERT INTO daily_attendance (id, date, status, periods, "studentId", "classroomId", "teacherId", "createdAt", "updatedAt")
         VALUES ($1, CURRENT_DATE, 'PRESENT', 1, $2, $3, $4, NOW(), NOW())`,
        [`att_${Date.now()}`, testCedula, classroomId, teacherId]
      );

      // 4. Eliminar al estudiante
      const deleteRes = await axios.delete(`${API_BASE}/users/${testCedula}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
      });
      expect(deleteRes.status).toBe(200);

      // 5. Verificar que NO quedaron datos huérfanos
      const checkGrades = await queryTenantDb(`SELECT count(*) FROM grades WHERE "studentId" = $1`, [testCedula]);
      expect(parseInt(checkGrades[0].count)).toBe(0);

      const checkAttendance = await queryTenantDb(`SELECT count(*) FROM daily_attendance WHERE "studentId" = $1`, [testCedula]);
      expect(parseInt(checkAttendance[0].count)).toBe(0);

      const checkEnrollment = await queryTenantDb(`SELECT count(*) FROM student_classrooms WHERE "studentId" = $1`, [testCedula]);
      expect(parseInt(checkEnrollment[0].count)).toBe(0);

      const checkUser = await queryTenantDb(`SELECT count(*) FROM users WHERE id = $1`, [testCedula]);
      expect(parseInt(checkUser[0].count)).toBe(0);

      // 6. RECREAR exactamente igual con la MISMA Cédula y el MISMO Email
      const recreateRes = await axios.post(
        `${API_BASE}/users`,
        {
          id: testCedula,
          email: testEmail,
          firstName: 'Estudiante',
          lastName: 'Recreacion',
          role: 'STUDENT',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(recreateRes.status).toBe(201);
      expect(recreateRes.data.user?.id || recreateRes.data.id).toBe(testCedula);
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-01', 'Estudiante recreación en cascada', error);
      throw error;
    } finally {
      // Limpieza final
      await queryTenantDb(`DELETE FROM grades WHERE "studentId" = $1`, [testCedula]);
      await queryTenantDb(`DELETE FROM daily_attendance WHERE "studentId" = $1`, [testCedula]);
      await queryTenantDb(`DELETE FROM student_classrooms WHERE "studentId" = $1`, [testCedula]);
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testCedula]);
    }
  });

  // =========================================================================
  // REC-02: Profesor - Preservación histórica y recreación exacta
  // =========================================================================
  test('REC-02: Profesor - Crear, Dictar Notas y Clases, Eliminar (Preservar Nombre) y Recrear', async ({}, testInfo) => {
    const testCedula = generateTestCedula();
    const testEmail = `prof_rec_${Date.now()}@testing.edu.ve`;
    const profFirstName = 'Profesor';
    const profLastName = 'Historico Perez';
    const fullTeacherName = `${profFirstName} ${profLastName}`;

    // Obtener un estudiante y aula para vincular notas
    const contextRes = await queryTenantDb(`
      SELECT sc."studentId", sc."classroomId", p.id as "periodId", cs."subjectId"
      FROM student_classrooms sc
      JOIN classrooms c ON sc."classroomId" = c.id
      JOIN periods p ON p."academicYearId" = c."academicYearId"
      JOIN classroom_subjects cs ON cs."classroomId" = c.id
      LIMIT 1
    `);
    const { studentId, classroomId, periodId, subjectId } = contextRes[0];

    const testActivityId = `act_prof_${Date.now()}`;
    const testGradeId = `gr_prof_${Date.now()}`;

    try {
      // 1. Crear profesor
      const createRes = await axios.post(
        `${API_BASE}/users`,
        {
          id: testCedula,
          email: testEmail,
          firstName: profFirstName,
          lastName: profLastName,
          role: 'TEACHER',
          specialization: 'Física',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);

      // 2. Crear actividad y calificación asignada por este profesor
      await queryTenantDb(
        `INSERT INTO activities (id, title, description, type, scope, "startDate", "dueDate", "maxGrade", weight, "isActive", "createdBy", "createdAt", "updatedAt", "classroomId", "subjectId", "periodId")
         VALUES ($1, 'Examen de Fisica Cuantica', 'Examen parcial', 'TAREA', 'CLASSROOM', NOW(), NOW() + interval '7 days', 20, 1, true, $2, NOW(), NOW(), $3, $4, $5)`,
        [testActivityId, testCedula, classroomId, subjectId, periodId]
      );

      await queryTenantDb(
        `INSERT INTO grades (id, score, "studentId", "activityId", "periodId", "subjectId", "teacherId", "createdAt", "updatedAt")
         VALUES ($1, 19.0, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [testGradeId, studentId, testActivityId, periodId, subjectId, testCedula]
      );

      // 3. Eliminar al profesor
      const deleteRes = await axios.delete(`${API_BASE}/users/${testCedula}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
      });
      expect(deleteRes.status).toBe(200);

      // 4. Verificar que el usuario docente ya no existe en users (cédula y email libres)
      const userCheck = await queryTenantDb(`SELECT count(*) FROM users WHERE id = $1`, [testCedula]);
      expect(parseInt(userCheck[0].count)).toBe(0);

      // 5. Verificar que la actividad conservó el nombre del profesor
      const activityCheck = await queryTenantDb(`SELECT description, "createdBy" FROM activities WHERE id = $1`, [testActivityId]);
      expect(activityCheck.length).toBe(1);
      expect(activityCheck[0].description).toContain(fullTeacherName);

      // 6. Verificar que la calificación conservó el nombre del profesor en metadata
      const gradeCheck = await queryTenantDb(`SELECT metadata, "teacherId" FROM grades WHERE id = $1`, [testGradeId]);
      expect(gradeCheck.length).toBe(1);
      const meta = typeof gradeCheck[0].metadata === 'string' ? JSON.parse(gradeCheck[0].metadata) : gradeCheck[0].metadata;
      expect(meta?.historicalTeacherName).toBe(fullTeacherName);

      // 7. RECREAR exactamente igual con la MISMA Cédula y el MISMO Email
      const recreateRes = await axios.post(
        `${API_BASE}/users`,
        {
          id: testCedula,
          email: testEmail,
          firstName: profFirstName,
          lastName: profLastName,
          role: 'TEACHER',
          specialization: 'Física',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(recreateRes.status).toBe(201);
      expect(recreateRes.data.user?.id || recreateRes.data.id).toBe(testCedula);
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-02', 'Profesor preservación y recreación', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM grades WHERE id = $1`, [testGradeId]);
      await queryTenantDb(`DELETE FROM activities WHERE id = $1`, [testActivityId]);
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testCedula]);
    }
  });

  // =========================================================================
  // REC-03: Ciclo de 3 Estados (Activo -> Archivado -> Login Bloqueado 403 -> Restaurado -> Login OK)
  // =========================================================================
  test('REC-03: 3 Estados - Activo -> Archivado -> Login 403 Bloqueado -> Restaurado -> Login OK', async ({}, testInfo) => {
    const testCedula = generateTestCedula();
    const testEmail = `status_rec_${Date.now()}@testing.edu.ve`;
    const password = 'password123';

    try {
      // 1. Crear usuario activo
      const createRes = await axios.post(
        `${API_BASE}/users`,
        {
          id: testCedula,
          email: testEmail,
          firstName: 'Usuario',
          lastName: 'PruebaEstados',
          role: 'TEACHER',
          password,
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);

      // 2. Login inicial debe ser exitoso (Estado: ACTIVO)
      const initialLogin = await axios.post(
        `${API_BASE}/auth/login`,
        { email: testEmail, password },
        { headers: { 'X-Institute-Slug': TENANT_SLUG } }
      );
      expect(initialLogin.status).toBe(200);
      expect(initialLogin.data.tokens?.accessToken).toBeTruthy();

      // 3. Archivar usuario
      const archiveRes = await axios.post(
        `${API_BASE}/users/${testCedula}/archive`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.data.user?.status).toBe('ARCHIVED');
      expect(archiveRes.data.user?.isActive).toBe(false);

      // Verificar en base de datos
      const dbCheck = await queryTenantDb(`SELECT status, "isActive", "archivedAt" FROM users WHERE id = $1`, [testCedula]);
      expect(dbCheck[0].status).toBe('ARCHIVED');
      expect(dbCheck[0].isActive).toBe(false);
      expect(dbCheck[0].archivedAt).not.toBeNull();

      // 4. Intentar login mientras está archivado -> DEBE dar 403 Forbidden explicativo
      let blocked = false;
      try {
        await axios.post(
          `${API_BASE}/auth/login`,
          { email: testEmail, password },
          { headers: { 'X-Institute-Slug': TENANT_SLUG } }
        );
      } catch (err) {
        blocked = true;
        expect(err.response?.status).toBe(403);
        expect(err.response?.data?.code).toBe('USER_ARCHIVED');
        expect(err.response?.data?.message || err.response?.data?.error).toContain('archivada');
      }
      expect(blocked).toBe(true);

      // 5. Restaurar usuario (Desarchivar)
      const unarchiveRes = await axios.post(
        `${API_BASE}/users/${testCedula}/unarchive`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(unarchiveRes.status).toBe(200);
      expect(unarchiveRes.data.user?.status).toBe('ACTIVE');
      expect(unarchiveRes.data.user?.isActive).toBe(true);

      // 6. Login nuevamente -> DEBE funcionar con éxito
      const restoredLogin = await axios.post(
        `${API_BASE}/auth/login`,
        { email: testEmail, password },
        { headers: { 'X-Institute-Slug': TENANT_SLUG } }
      );
      expect(restoredLogin.status).toBe(200);
      expect(restoredLogin.data.tokens?.accessToken).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-03', 'Ciclo 3 estados', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testCedula]);
    }
  });

  // =========================================================================
  // REC-04: Materia - Crear, Eliminar y Recrear con mismo Código y Nombre
  // =========================================================================
  test('REC-04: Materia - Crear, Eliminar y Recrear con mismo código y slug', async ({}, testInfo) => {
    const code = `REC${Math.floor(100 + Math.random() * 899)}`;
    const name = `Materia Experimental ${code}`;

    let subjectId = null;
    try {
      // 1. Crear materia
      const createRes = await axios.post(
        `${API_BASE}/subjects`,
        {
          name,
          code,
          color: '#4F46E5',
          description: 'Materia para prueba de ciclo de vida',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);
      subjectId = createRes.data.data?.id || createRes.data.id;
      expect(subjectId).toBeTruthy();

      // 2. Eliminar materia
      const deleteRes = await axios.delete(`${API_BASE}/subjects/${subjectId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
      });
      expect(deleteRes.status).toBe(200);

      // 3. Recrear exactamente igual con el MISMO código y nombre
      const recreateRes = await axios.post(
        `${API_BASE}/subjects`,
        {
          name,
          code,
          color: '#4F46E5',
          description: 'Materia recreada',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(recreateRes.status).toBe(201);
      subjectId = recreateRes.data.data?.id || recreateRes.data.id;
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-04', 'Materia recreación', error);
      throw error;
    } finally {
      if (subjectId) {
        await queryTenantDb(`DELETE FROM subjects WHERE id = $1`, [subjectId]);
      }
    }
  });

  // =========================================================================
  // REC-05: Actividad - Crear, con Notas, Eliminar en Cascada y Recrear
  // =========================================================================
  test('REC-05: Actividad / Tarea - Crear, Calificar, Eliminar y Recrear', async ({}, testInfo) => {
    // Obtener contexto
    const contextRes = await queryTenantDb(`
      SELECT c.id as "classroomId", p.id as "periodId", cs."subjectId", sc."studentId", cs."teacherId"
      FROM classrooms c
      JOIN academic_years ay ON c."academicYearId" = ay.id
      JOIN periods p ON p."academicYearId" = ay.id
      JOIN classroom_subjects cs ON cs."classroomId" = c.id
      JOIN student_classrooms sc ON sc."classroomId" = c.id
      WHERE ay.status = 'ACTIVE' AND cs."teacherId" IS NOT NULL
      LIMIT 1
    `);

    expect(contextRes.length).toBeGreaterThan(0);
    const { classroomId, periodId, subjectId, studentId, teacherId } = contextRes[0];
    const activityTitle = `Tarea Ensayo REC-${Date.now()}`;

    let activityId = null;
    try {
      // 1. Crear actividad
      const createRes = await axios.post(
        `${API_BASE}/activities`,
        {
          title: activityTitle,
          description: 'Descripción completa para la tarea de recreación',
          type: 'TAREA',
          scope: 'CLASSROOM',
          startDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
          maxScore: 20,
          subjectId,
          classroomId,
          periodId,
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);
      activityId = createRes.data.activity?.id || createRes.data.data?.id || createRes.data.id;

      // 2. Insertar nota asociada para verificar que no bloquea la eliminación
      await queryTenantDb(
        `INSERT INTO grades (id, score, "studentId", "activityId", "periodId", "subjectId", "teacherId", "createdAt", "updatedAt")
         VALUES ($1, 16.0, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [`gr_act_${Date.now()}`, studentId, activityId, periodId, subjectId, teacherId]
      );

      // 3. Eliminar actividad
      const deleteRes = await axios.delete(`${API_BASE}/activities/${activityId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
      });
      expect([200, 204]).toContain(deleteRes.status);

      // 4. Recrear actividad exactamente igual
      const recreateRes = await axios.post(
        `${API_BASE}/activities`,
        {
          title: activityTitle,
          description: 'Descripción completa para la tarea de recreación',
          type: 'TAREA',
          scope: 'CLASSROOM',
          startDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
          maxScore: 20,
          subjectId,
          classroomId,
          periodId,
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(recreateRes.status).toBe(201);
      activityId = recreateRes.data.activity?.id || recreateRes.data.data?.id || recreateRes.data.id;
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-05', 'Actividad recreación', error);
      throw error;
    } finally {
      if (activityId) {
        await queryTenantDb(`DELETE FROM grades WHERE "activityId" = $1`, [activityId]);
        await queryTenantDb(`DELETE FROM activities WHERE id = $1`, [activityId]);
      }
    }
  });

  // =========================================================================
  // REC-06: Ciclo Escolar - Crear, Eliminar y Recrear
  // =========================================================================
  test('REC-06: Ciclo Escolar - Crear, Eliminar y Recrear con mismo nombre', async ({}, testInfo) => {
    const randomStart = 2050 + Math.floor(Math.random() * 40);
    const cycleName = `Año Escolar ${randomStart}-${randomStart + 1}`;
    let createdCycleId = null;

    try {
      // 1. Crear ciclo escolar
      const createRes = await axios.post(
        `${API_BASE}/academic-years`,
        {
          name: cycleName,
          startDate: `${randomStart}-09-15T00:00:00.000Z`,
          endDate: `${randomStart + 1}-07-15T00:00:00.000Z`,
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(createRes.status).toBe(201);
      createdCycleId = createRes.data.data?.id || createRes.data.id;

      // 2. Eliminar ciclo escolar (requiere contraseña admin)
      const deleteRes = await axios.delete(`${API_BASE}/academic-years/${createdCycleId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
        data: {
          password: '123456',
        },
      });
      expect(deleteRes.status).toBe(204);

      // 3. Recrear ciclo escolar con el MISMO nombre
      const recreateRes = await axios.post(
        `${API_BASE}/academic-years`,
        {
          name: cycleName,
          startDate: `${randomStart}-09-15T00:00:00.000Z`,
          endDate: `${randomStart + 1}-07-15T00:00:00.000Z`,
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );
      expect(recreateRes.status).toBe(201);
      createdCycleId = recreateRes.data.data?.id || recreateRes.data.id;
    } catch (error) {
      await captureEvidence(testInfo, null, 'REC-06', 'Ciclo escolar recreación', error);
      throw error;
    } finally {
      if (createdCycleId) {
        await queryTenantDb(`DELETE FROM periods WHERE "academicYearId" = $1`, [createdCycleId]);
        await queryTenantDb(`DELETE FROM academic_years WHERE id = $1`, [createdCycleId]);
      }
    }
  });
});
