import { redirect } from 'next/navigation';

/**
 * LAS MATERIAS PENDIENTES YA NO SON UNA PANTALLA DEL MENÚ (2026-10-12)
 *
 * Se trabajan como una clase: dentro de la materia (la pestaña «Pendientes»,
 * la del profesor que la evalúa) y se siguen en la sección del alumno (la del
 * guía); las reglas y las fechas, en Configuración → Académica. Quien llegue
 * por un enlace viejo va a Académico.
 */
export default function MateriasPendientesPage() {
    redirect('/dashboard/academico');
}
