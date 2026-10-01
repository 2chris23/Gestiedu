# Lo de un liceo venezolano en Gestiedu

Empezó el 2026-09-26 como informe de lo que faltaba; al 2026-09-27 **está todo
hecho**. Queda como índice de dónde vive cada cosa. La regla de siempre: lo del
MPPE es el valor por defecto, y cada liceo lo cambia (plantillas, apreciaciones,
reglas del fin de año, horas de labor social).

Fuentes consultadas: la estructura del código del plantel (trosell.net), el
instructivo del Resumen Final del Rendimiento Estudiantil del MPPE (copias en
cerpe.org.ve y slideshare) y el calendario escolar 2025-2026 del MPPE (gremio
docente).

## Hecho

| Qué | Dónde | Pruebas |
| :--- | :--- | :--- |
| **Datos oficiales del plantel** (DEA, estadístico, dependencia, zona, entidad, municipio, parroquia, líneas del ministerio, código del plan de estudio) | Configuración → Información General | PLANTEL-01…04 |
| **Un solo membrete** en boleta, constancias, resumen final, certificación, plan de evaluación y acta de compromiso | `MembreteOficial.tsx` | MEMB-UI-01/02 |
| **Datos del alumno**: nacionalidad, lugar y entidad de nacimiento | perfil del alumno (solo el admin) | — |
| **Cédula escolar**: se marca si es de identidad o escolar, se arma con los datos de la madre y se cambia por la de identidad sin perder el historial | ficha del alumno → «Cambiar cédula» | CED-UI-01 |
| **Áreas con apreciación** (GCRP y las que el liceo marque): fuera de todo promedio y de la condición | materia → «Se evalúa con apreciación» | CUALI-*, `MAPA_DE_CALCULOS.md` §1b |
| **Calendario del MPPE** como punto de partida al crear el año (lapsos, diagnóstico, feriados) | Académico → nuevo año | CAL-MPPE-01…03 |
| **El fin del año, por pasos**: faltantes, revisión, decisiones, año siguiente, expedientes, corrección tras cerrar | Académico → año → Cierre | CIERRE-*, `MAPA` §8c |
| **Materia pendiente**: la evalúa el profesor de la materia, por momentos, con acta de compromiso | «Pendientes» | PEND-* |
| **Labor social**: la anotan el admin y el profesor guía; cuenta para egresar | «Labor social» | LABOR-01…07, `MAPA` §8d |
| **Resumen final** con el formato del MPPE, en sus tres tipos (final, revisión, materia pendiente), docentes y firmas, en oficio apaisado | sección → Resumen final | DOC-01…08, `MAPA` §8e |
| **Certificación de calificaciones** de 1.º a 5.º, con los años de otro plantel cargados a mano | ficha del alumno | DOC-UI-03 |
| **Constancias**: estudio, buena conducta, prosecución, retiro, inscripción y labor social, con el texto editable por liceo | Configuración → Documentos | DOC-UI-01 |
| **Inscripción sin castigo**: crear una cuenta pide nombre, apellido, correo, cédula, contraseña, rol y sexo; lo demás y los **recaudos** (lista del liceo), en el perfil; **planilla de inscripción** | Usuarios → ficha | CREAR-01, REC-01…04 |
| **Observaciones** en un panel propio y **citación al representante** (aviso a su teléfono, hoja impresa, ¿vino?) | «Observaciones» | CITA-*, NOTI-* |
| **Traslado y retiro**: hoja de notas parciales y archivo firmado para importar en otro liceo con Gestiedu | ficha del alumno; Usuarios → Importar | TRAS-01…08 |
| **Estadística de matrícula** (inicial, ingresos, retiros, final, por sexo y edad) | ciclo → Matrícula | MAT-*, `MAPA` §8f |
| **Título de bachiller**: graduandos, serial, constancia de título en trámite | ciclo → Graduandos | TIT-* |
| **Consejo de sección** con casos propuestos y acta | sección → Consejo | CONSEJO-* |
| **Personal**: constancia de trabajo y hoja de carga horaria | ficha del profesor | PERS-* |
| **Carnet estudiantil** (sin QR, decidido) | ficha del alumno; sección | CARNET-* |
| **Comedor (PAE)**, un módulo que se activa | Configuración → Comedor (PAE) | PAE-* |
| **Plan de evaluación en papel** con el formato de un liceo, **acta de socialización** y **instrumentos de evaluación** (lista de cotejo, escala de estimación, rúbrica, por puntos) con los que se califica marcando casillas | plan de la materia | INSTR-*, PAPEL-*, `MAPA` §1a-bis |

## Lo que confirmar con la secretaría de cada liceo

Está hecho con el valor más común, y se cambia sin tocar código:

- el orden y el separador de la cédula escolar que usa su zona;
- si Orientación y Convivencia se evalúa con apreciación;
- las horas de labor social (60 por defecto) y si bloquean el egreso o solo avisan;
- el texto de cada constancia;
- la mención del título (por defecto «Bachiller en Ciencias y Tecnología»), la lista
  de recaudos y la fecha de corte de la edad en la matrícula (30 de septiembre);
- el texto del acta de socialización del plan.

## Lo que no se hace

- **Enviar datos al sistema del ministerio.** Decidido: nunca. No hay una forma
  pública y estable de hacerlo, y un envío mal hecho es peor que un papel bien
  impreso. Lo útil es que el papel salga en el formato exacto.
