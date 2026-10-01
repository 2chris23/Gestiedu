import { columnaDelTitulo, leerPlanDeWord } from '../services/importar-plan-de-word';

/**
 * IMPORTAR EL PLAN DE UN WORD (WORD-01…05)
 *
 * La tabla tiene la forma de la hoja del MPPE que entregan los profesores
 * (como sale de mammoth: celdas unidas con colspan/rowspan y un párrafo por
 * línea). Los datos son inventados.
 */
const p = (...lineas: string[]) => lineas.map((l) => `<p>${l}</p>`).join('');
const HOJA = `
<table>
  <tr><td rowspan="2"></td><td rowspan="2">${p('REPÚBLICA BOLIVARIANA DE VENEZUELA')}</td><td rowspan="2">${p('DOCENTE:')}</td><td rowspan="2">${p('Prof. Ana Pérez')}</td><td rowspan="2">${p('AREA DE FORMACION:')}</td><td colspan="2" rowspan="2">${p('Química')}</td><td colspan="4">${p('TIEMPO DE EJECUSION DEL PROYECTO LAPSO DEL MOMENTO:')}</td></tr>
  <tr><td colspan="4">${p('1 PRIMER MOMENTO')}</td></tr>
  <tr><td colspan="2">${p('U.E. DE PRUEBA')}</td><td>${p('CEDULA:')}</td><td>${p('V-1.234.567')}</td><td>${p('TOTAL DE SEMANAS:')}</td><td colspan="2">${p('12 semanas')}</td><td colspan="2">${p('DESDE:')}</td><td colspan="2">${p('14/09/2026')}</td></tr>
  <tr><td colspan="2">${p('Código DEA X')}</td><td>${p('TELEFONO:')}</td><td>${p('0414-0000000')}</td><td>${p('CORREO E.:')}</td><td colspan="2">${p('ana@ejemplo.com')}</td><td colspan="2">${p('HASTA:')}</td><td colspan="2">${p('15/12/2026')}</td></tr>
  <tr><td colspan="2" rowspan="4"></td><td rowspan="2">${p('REFERENTES ETICOS:')}</td><td colspan="4" rowspan="2">${p('Educar para la libertad')}</td><td colspan="4">${p('PERIODO ESCOLAR')}</td></tr>
  <tr><td colspan="4">${p('2026 - 2027')}</td></tr>
  <tr><td rowspan="2">${p('P.E.I.C.:')}</td><td colspan="4" rowspan="2">${p('La escuela y la comunidad')}</td><td>${p('AÑO:')}</td><td colspan="3">${p('4TO')}</td></tr>
  <tr><td>${p('SECCIONES:')}</td><td colspan="3">${p('A-B')}</td></tr>
  <tr><td colspan="11">${p('PLAN DE LAPSO')}</td></tr>
  <tr><td rowspan="2">${p('TEMA GENERADOR', 'TEJIDO TEMATICO')}</td><td rowspan="2">${p('REFERENTES TEORICO-PRACTICO')}</td><td rowspan="2">${p('ENFASIS CURRICULAR')}</td><td rowspan="2">${p('FECHA')}</td><td colspan="3">${p('ESTRATEGIAS DE EVALUACION')}</td><td colspan="2" rowspan="2">${p('CRITERIOS DE EVALUACION CONOCER-HACER-SER-CONVIVIR')}</td><td colspan="2">${p('PONDERACION')}</td></tr>
  <tr><td>${p('ACTIVIDAD')}</td><td>${p('TECNICA')}</td><td>${p('INSTRUMENTO')}</td><td>${p('%')}</td><td>${p('PTS.')}</td></tr>
  <tr><td rowspan="2">${p('La materia y sus', 'transformaciones')}</td><td>${p('Mezclas')}</td><td rowspan="3">${p('Ciencia y', 'tecnología')}</td><td>${p('Semana 3', '28/09/2026 Al', '02/10/2026')}</td><td>${p('Infografía')}</td><td>${p('Prueba Oral')}</td><td>${p('Escala de Estimación')}</td><td colspan="2">${p('SER Responsabilidad', 'HACER Creatividad')}</td><td>${p('25%')}</td><td>${p('5 pts.')}</td></tr>
  <tr><td>${p('Soluciones')}</td><td>${p('Semana 6')}</td><td>${p('Examen')}</td><td>${p('Prueba practica')}</td><td>${p('Observación')}</td><td colspan="2">${p('SER Puntualidad')}</td><td>${p('25%')}</td><td>${p('5 pts.')}</td></tr>
  <tr><td>${p('Contenidos impartidos')}</td><td>${p('Tareas')}</td><td>${p('Semana 11')}</td><td>${p('Revisión del cuaderno de actividades')}</td><td>${p('Análisis de tareas')}</td><td>${p('Lista de Cotejo')}</td><td colspan="2">${p('CONOCER (17 PTS)')}</td><td>${p('50%')}</td><td>${p('10 pts.')}</td></tr>
  <tr><td>${p('Entregado por:')}</td><td>${p('Prof. Ana Pérez')}</td><td>${p('Fecha de entrega:')}</td><td></td><td>${p('Recibido por:')}</td><td colspan="2"></td><td colspan="2">${p('Observación:')}</td><td colspan="2"></td></tr>
  <tr><td>${p('Observaciones:')}</td><td colspan="10">${p('Evaluación continua al 100%.')}</td></tr>
  <tr><td>${p('REPÚBLICA BOLIVARIANA DE VENEZUELA')}</td></tr>
  <tr><td>${p('TEMA GENERADOR')}</td><td>${p('ACTIVIDAD')}</td><td>${p('TECNICA')}</td></tr>
  <tr><td>${p('Otro año')}</td><td>${p('No se lee')}</td><td>${p('—')}</td></tr>
</table>`;

describe('Importar el plan de un Word', () => {
    it('WORD-01: encuentra la fila de títulos aunque la tabla empiece por el membrete, con dos niveles de títulos', () => {
        const { filas } = leerPlanDeWord(HOJA);
        expect(filas).toHaveLength(3);
        expect(filas[0].datos).toMatchObject({
            textContent: 'Mezclas',
            actividadEval: 'Infografía',
            tecnicas: 'Prueba Oral',
            instrumentos: 'Escala de Estimación',
            ponderacion: '25',
            puntos: '5',
        });
        expect(filas[2].datos.instrumentos).toBe('Lista de Cotejo');
        expect(filas[2].datos.puntos).toBe('10');
    });

    it('WORD-02: cada evaluación va a su semana; el tema generador unido llega a todas las que abarca', () => {
        const { filas } = leerPlanDeWord(HOJA);
        expect(filas.map((f) => f.semana)).toEqual([3, 6, 11]);
        // «La materia y sus» / «transformaciones»: una línea partida a mano es una sola.
        expect(filas[0].datos.title).toBe('La materia y sus transformaciones');
        expect(filas[1].datos.title).toBe('La materia y sus transformaciones');
        expect(filas[2].datos.title).toBe('Contenidos impartidos');
        // «SER…» / «HACER…» sí son líneas distintas.
        expect(filas[0].datos.criterios).toBe('SER Responsabilidad\nHACER Creatividad');
    });

    it('WORD-03: la cabecera rellena los datos del plan', () => {
        const { metadatos } = leerPlanDeWord(HOJA);
        expect(metadatos).toMatchObject({
            nombreDocente: 'Prof. Ana Pérez',
            areaFormacion: 'Química',
            cedulaDocente: 'V-1.234.567',
            telefonoDocente: '0414-0000000',
            correoDocente: 'ana@ejemplo.com',
            totalSemanas: 12,
            fechaDesde: '2026-09-14',
            fechaHasta: '2026-12-15',
            referentesEticos: 'Educar para la libertad',
            peic: 'La escuela y la comunidad',
            enfasisCurricular: 'Ciencia y tecnología',
            observaciones: 'Evaluación continua al 100%.',
        });
    });

    it('WORD-04: se para en «Entregado por» y no mezcla el plan del año siguiente', () => {
        const { filas } = leerPlanDeWord(HOJA);
        expect(filas.some((f) => Object.values(f.datos).includes('No se lee'))).toBe(false);
    });

    it('WORD-05: una tabla sin títulos del plan no da filas; los títulos se reconocen sin tildes ni mayúsculas', () => {
        expect(leerPlanDeWord('<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>').filas).toEqual([]);
        expect(columnaDelTitulo('CRITERIOS DE EVALUACIÓN')).toBe('criterios');
        expect(columnaDelTitulo('Técnica')).toBe('tecnicas');
        expect(columnaDelTitulo('PTS.')).toBe('puntos');
        expect(columnaDelTitulo('Estrategias de evaluación')).toBeNull();
    });
});
