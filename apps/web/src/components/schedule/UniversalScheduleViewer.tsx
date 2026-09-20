/**
 * LO QUE ES UN BLOQUE DEL HORARIO
 *
 * Aquí vivía además una tabla de horario que **no se pintaba en ninguna
 * pantalla**: siete archivos importaban de este módulo solo el tipo. La tabla
 * llevaba dentro una cabecera de mentira ("Tutor: Ana Pérez"), la hora del
 * recreo escrita a mano y un selector de turno que nadie podía llegar a tocar.
 *
 * Se quitó. Borrar lo que no se usa evita que alguien "arregle" durante una
 * hora una pantalla que no existe. Las que sí se ven son
 * `StudentScheduleSection` (sección y alumno) y `SubjectScheduleSection`
 * (materia).
 */
export interface ScheduleBlock {
    id?: string;
    /** Aula donde se da la clase, si la vista la conoce. */
    classroom?: string;
    content?: string;
    day: string;
    startTime: string;
    endTime: string;
    subject: string;
    location?: string;
    detail?: string;
    color?: string;
    link?: string;
    subjectId?: string;
    /** Sección donde se da (el horario de un profesor cruza varias). */
    classroomId?: string;
}
