# Lo que le falta a Gestiedu para un liceo venezolano

Informe para decidir, del 2026-09-26. Nada de esto está hecho, salvo lo de la
primera sección. Cada punto dice qué es, qué hay hoy en el sistema y qué haría
falta. Lo marcado **(confirmar)** conviene preguntarlo a la secretaría o al
control de estudios de un liceo antes de hacerlo: cambia de un año a otro y de
una zona educativa a otra.

Fuentes consultadas: la estructura del código del plantel (trosell.net), el
instructivo del Resumen Final del Rendimiento Estudiantil del MPPE (copias en
cerpe.org.ve y slideshare) y el calendario escolar 2025-2026 del MPPE (gremio
docente).

## Ya hecho (2026-09-26)

- **Datos oficiales del plantel** en Configuración → Información General:
  nombre oficial, código DEA, código estadístico (6 dígitos), código de
  dependencia (9 dígitos), zona educativa, entidad federal (de una lista),
  municipio, parroquia y las líneas del ministerio.
- **Un solo membrete** con esos datos en la boleta, la constancia, el resumen
  final, el plan de evaluación y el acta de compromiso. El horario descargado
  lleva el nombre del liceo y su código DEA.
- **Semanas de diagnóstico** antes del plan de evaluación en cada lapso, con la
  fecha y el nombre que decida cada liceo.

## Lo que falta, por orden de importancia

### 1. El Resumen Final con el formato oficial del MPPE

Es el documento que el liceo entrega a la zona educativa al cerrar el año, y el
que más trabajo le quita a la secretaría si sale solo.

- **Hoy:** existe un resumen final por sección (una fila por alumno, una
  columna por materia, condición y totales). Es un resumen propio, no el
  formato del ministerio.
- **Falta:**
  - **El tipo de evaluación:** Final, Revisión o Materia pendiente. Cada tipo
    es una hoja aparte, con su mes y año.
  - **Los datos de cada alumno que pide la hoja:** cédula de identidad o cédula
    escolar, apellidos, nombres, lugar de nacimiento, entidad federal de
    nacimiento, sexo, y fecha de nacimiento en día, mes y año.
  - **La lista de docentes de cada área** con su cédula, y las firmas del
    director y del docente guía, con sus sellos.
  - Sacarlo en el tamaño de papel y la orientación del formato (confirmar
    cuál usa la zona).

### 2. Datos del alumno que hoy no se guardan

- **Hoy** se guardan la cédula (que es el identificador de la cuenta), la fecha
  de nacimiento, el sexo, el teléfono y la dirección.
- **Faltan:**
  - el **lugar de nacimiento**;
  - la **entidad federal de nacimiento**;
  - la **nacionalidad** (V/E).

  Los pide el Resumen Final y la inscripción. Son campos nuevos del alumno que
  solo edita el admin, como el resto de su perfil.

### 3. La cédula escolar

Muchos alumnos de 1er año no tienen cédula de identidad todavía. El MPPE les da
una **cédula escolar**, que se arma con cuatro partes:

- la nacionalidad;
- un dígito por el orden del parto (1 si es único, 2 y 3 si nacieron varios ese
  año);
- los dos últimos dígitos del año de nacimiento;
- la cédula de la madre (o del representante).

**(confirmar)** el orden exacto y el separador que usa la zona.

- **Hoy:** el admin escribe a mano el identificador del alumno. Se puede poner
  ahí la cédula escolar, pero nada la arma, nada comprueba que esté bien y no
  se distingue de una cédula de identidad.
- **Falta:**
  - marcar si el identificador es una cédula de identidad o una escolar;
  - una ayuda que la arme a partir de los datos de la madre;
  - cambiarla por la de identidad cuando el alumno la saque, sin perder su
    historial (hoy el identificador es la llave de todo).

### 4. La certificación de calificaciones

Es la hoja con todas las notas definitivas de 1er a 5to año. Se pide al
graduarse o al cambiarse de liceo.

- **Hoy:** la boleta es de un solo año escolar.
- **Falta:** juntar todos los años del alumno en el sistema, y dejar anotar a
  mano los años que cursó en otro liceo, con el nombre y el código de ese
  plantel. Lleva el membrete (ya hecho) y la firma del director.

### 5. Áreas que no se evalúan con número (confirmar)

En media general, los **Grupos de Creación, Recreación y Producción (GCRP)** se
evalúan de forma cualitativa: con una apreciación, no con una nota del 1 al 20,
y no entran en el promedio. **Orientación y Convivencia** podría ir igual
(confirmar).

- **Hoy:** toda materia se califica del 1 al 20 y cuenta en el promedio.
- **Falta:**
  - una marca por materia, «se evalúa con apreciación», con las apreciaciones
    que el liceo ponga (configurable, no fijas en el código);
  - que esas materias queden fuera del promedio y de la condición de promovido.

### 6. Otros documentos de secretaría

- **Constancia de prosecución**: que el alumno aprobó el año y puede seguir al
  siguiente.
- **Constancia de retiro**, al cambiarse de liceo.
- **Constancia de inscripción.**

Cada una es una variante de la constancia que ya existe: el mismo membrete, la
misma firma y otro párrafo.

### 7. El calendario del MPPE como punto de partida

- **Hoy:** el ciclo escolar y sus lapsos los pone el admin a mano. Ya se puede
  marcar el periodo de diagnóstico.
- **Falta:** ofrecer al crear el ciclo el calendario oficial de ese año (por
  ejemplo, en 2025-2026 el diagnóstico va del 15 de septiembre al 15 de
  octubre), como valor por defecto que el liceo cambia.

## Lo que no conviene hacer (todavía)

- **Enviar datos al sistema del ministerio.** No hay una forma pública y
  estable de hacerlo, y un envío mal hecho es peor que un papel bien impreso.
  Lo útil es que el papel salga en el formato exacto.
