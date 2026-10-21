import { redirect } from 'next/navigation';

/**
 * LA LABOR SOCIAL YA NO ES UNA PANTALLA DEL MENÚ (2026-10-12)
 *
 * Con el liceo lleno era una lista sin fin de todas las secciones. Ahora va
 * dentro de cada sección (Académico → el año → la sección → «Labor social»),
 * y sus reglas en Configuración → Académica. Quien llegue por un enlace viejo
 * va a Académico.
 */
export default function LaborSocialPage() {
    redirect('/dashboard/academico');
}
