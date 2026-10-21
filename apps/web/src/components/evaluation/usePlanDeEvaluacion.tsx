'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import {
    useEvaluationPlanMetadata,
    useUpsertEvaluationPlanMetadata,
    useEvaluationPlanRows,
    useBatchUpsertRows,
    useCopyTargets,
    useCopyPlan,
    type EvaluationPlanMetadata,
    type AutoPopulatedData,
} from '@/hooks/useEvaluationPlan';
import api from '@/lib/axios';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from './planColumns';
import { useClassActivities } from '@/hooks/useLiveClass';
import { type WeekRow, getWeekDates, buildEmptyWeekRows, dbRowsToWeekRows } from './planEnSemanas';
import { weekRowsToDbRows } from './piezas-del-plan';

/** Lo que EvaluationPlanSection sabe y hace; su JSX vive en el componente. */
export function usePlanDeEvaluacion({
  classroomId, subjectId, lapso = '1', canEdit
}: {
  classroomId: string;
  subjectId: string;
  lapso?: string;
  canEdit?: boolean;
}) {
  const selectedLapso = lapso;

  // ── Server data ──────────────────────────────
  const { data: metaData, isLoading: isLoadingMeta } = useEvaluationPlanMetadata({ classroomId, subjectId, lapso });
  const { data: rowsData, isLoading: isLoadingRows } = useEvaluationPlanRows({ classroomId, subjectId, lapso });
  const { data: actividadesData } = useClassActivities(classroomId, subjectId);
  const [instrumentosAbierto, setInstrumentosAbierto] = useState(false);
  const { mutateAsync: saveMeta, isPending: isSavingMeta } = useUpsertEvaluationPlanMetadata();
  const { mutateAsync: saveRows, isPending: isSavingRows } = useBatchUpsertRows();
  const queryClient = useQueryClient();

  // ── Local state ──────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  /**
   * La versión del plan que se tenía delante al empezar a editar, y cómo
   * estaba todo en ese momento (para saber si hay cambios sin guardar).
   */
  const versionAlEditar = useRef<string | undefined>(undefined);
  const comoEstabaAlEditar = useRef<string>('');
  /** Alguien guardó este plan desde otro sitio mientras se editaba aquí. */
  const [choque, setChoque] = useState<string | null>(null);
  const [localMeta, setLocalMeta] = useState<Partial<EvaluationPlanMetadata>>({});
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [columns, setColumns] = useState<ColDef[]>([...DEFAULT_PLAN_COLUMNS]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const preguntar = useConfirm();
  const [isImporting, setIsImporting] = useState(false);

  // ── Copiar el plan a otras secciones ─────────
  const [copiandoAbierto, setCopiandoAbierto] = useState(false);
  const [verCompleto, setVerCompleto] = useState(false);
  const [destinosElegidos, setDestinosElegidos] = useState<string[]>([]);
  const { data: destinos = [], isLoading: cargandoDestinos } = useCopyTargets({
    sourceClassroomId: classroomId,
    subjectId,
    enabled: copiandoAbierto,
  });
  const { mutateAsync: copiarPlan, isPending: copiando } = useCopyPlan();

  const alternarDestino = (id: string) =>
    setDestinosElegidos(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const cerrarCopiar = () => {
    setCopiandoAbierto(false);
    setDestinosElegidos([]);
  };

  const confirmarCopia = async () => {
    if (destinosElegidos.length === 0) return;
    try {
      await copiarPlan({
        sourceClassroomId: classroomId,
        sourceSubjectId: subjectId,
        sourceLapso: selectedLapso,
        targetClassroomIds: destinosElegidos,
      });
      toast.success(
        destinosElegidos.length === 1
          ? 'Plan copiado a 1 sección'
          : `Plan copiado a ${destinosElegidos.length} secciones`
      );
      cerrarCopiar();
    } catch (error: any) {
      // El servidor dice el motivo exacto (p.ej. una sección que no es suya):
      // se muestra tal cual en vez de un "ocurrió un error".
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'No se pudo copiar el plan');
    }
  };

  const handleImportWord = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append('file', file);

      // Sin «/api» delante: el cliente ya lo pone. Con él, la dirección era
      // /api/api/… y la importación no funcionó nunca.
      const response = await api.post('/evaluation-plan/parse-word', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const filas: Array<{ semana: number | null; datos: Record<string, string> }> =
        response.data?.filas ?? (response.data?.rows ?? []).map((datos: Record<string, string>) => ({ semana: null, datos }));
      if (filas.length) {
        /**
         * EL WORD ES EL PLAN
         *
         * Importar es poner el plan del Word: si el lapso ya tiene algo, se
         * pregunta y se vacía antes (si no, las semanas que el Word no trae
         * se quedaban con lo de antes, mezclado). Nada se guarda hasta
         * «Guardar»; y guardar sin una evaluación que ya tiene notas da 409.
         */
        const yaTieneAlgo = weeks.some((w) => Object.values(w.data).some((v) => v !== '' && v !== 0 && v !== undefined && v !== null));
        if (yaTieneAlgo) {
          const ok = await preguntar({
            title: 'Reemplazar el plan con el del Word',
            description: `Se pone el plan del Word (${filas.length} ${filas.length === 1 ? 'evaluación' : 'evaluaciones'}) y se vacía lo que había en este momento. No se guarda hasta que pulses «Guardar».`,
            confirmLabel: 'Reemplazar',
          });
          if (!ok) return;
        }
        const newWeeks = weeks.map((w) => ({ ...w, data: {}, colSpan: {} }) as WeekRow);
        let siguiente = 0;
        let fuera = 0;
        filas.forEach(({ semana, datos }) => {
          const r = { ...datos };
          // Cada evaluación a SU semana («Semana 3» → la fila 3); sin semana, en orden.
          const i = semana && semana >= 1 ? semana - 1 : siguiente;
          siguiente = i + 1;
          if (i >= newWeeks.length) {
            fuera++;
            return;
          }
          // Sincronizar puntos y ponderación si vienen del Word
          if (r['ponderacion'] && !r['puntos']) {
            const pc = parseFloat(String(r['ponderacion']).replace('%', '').trim());
            if (!isNaN(pc)) {
              const pt = Math.round((pc / 100) * 20 * 100) / 100;
              r['puntos'] = String(pt);
              r['ponderacion'] = String(Math.round((pt / 20) * 100 * 100) / 100);
            }
          } else if (r['puntos']) {
            const pt = parseFloat(String(r['puntos']).trim());
            if (!isNaN(pt)) {
              r['puntos'] = String(Math.round(pt * 100) / 100);
              r['ponderacion'] = String(Math.round((pt / 20) * 100 * 100) / 100);
            }
          }
          newWeeks[i] = { ...newWeeks[i], data: { ...newWeeks[i].data, ...r }, colSpan: { ...newWeeks[i].colSpan } };
          Object.keys(r).forEach((k) => {
            newWeeks[i].colSpan[k] = 1;
          });
        });
        setWeeks(newWeeks);
        // Los datos de la cabecera del Word (docente, referentes, P.E.I.C.…).
        const metadatos = response.data?.metadatos ?? {};
        if (Object.keys(metadatos).length) setLocalMeta((m) => ({ ...m, ...metadatos }));
        const puestas = filas.length - fuera;
        toast.success(
          `Importadas ${puestas} ${puestas === 1 ? 'evaluación' : 'evaluaciones'} del Word` +
            (fuera ? `; ${fuera} caen fuera de las ${newWeeks.length} semanas del lapso` : '') +
            '. Revisa y guarda.'
        );
      }
    } catch (error: any) {
      console.error(error);
      // El servidor dice qué no encontró; si no, lo de siempre.
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Error al importar el documento. Asegúrate de que tenga una tabla válida.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Derived ──────────────────────────────────
  const autoPopulated: AutoPopulatedData = metaData?.autoPopulated || {};
  const totalWeeks = autoPopulated.lapsoWeeks || localMeta.totalSemanas || 24;

  // ── Sync from server ─────────────────────────
  // MIENTRAS SE EDITA, LO DE LA PANTALLA NO SE TOCA.
  // Estas dos sincronizaciones copiaban lo del servidor encima de lo que el
  // profesor estaba escribiendo cada vez que llegaba una lectura nueva —y
  // llega una tras CUALQUIER guardado de cualquier pantalla, y con cada aviso
  // de tiempo real—. Veinte minutos de trabajo podían desaparecer sin que él
  // hiciera nada. Al salir del editor, sí se vuelve a lo guardado.
  useEffect(() => {
    if (isEditing) return;
    if (metaData?.metadata) {
      setLocalMeta(metaData.metadata);
      // restore custom columns if saved
      if (metaData.metadata.customColumns) {
        try {
          const parsed: ColDef[] = JSON.parse(metaData.metadata.customColumns);
          if (Array.isArray(parsed) && parsed.length > 0) setColumns(parsed);
        } catch {}
      }
    } else {
      setLocalMeta({});
      setColumns([...DEFAULT_PLAN_COLUMNS]);
    }
  }, [metaData, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    const tw = autoPopulated.lapsoWeeks || localMeta.totalSemanas || 24;
    if (rowsData?.rows && rowsData.rows.length > 0) {
      setWeeks(dbRowsToWeekRows(rowsData.rows, tw));
    } else {
      setWeeks(buildEmptyWeekRows(tw));
    }
  }, [rowsData, autoPopulated.lapsoWeeks, localMeta.totalSemanas, isEditing]);

  // ── Totals ────────────────────────────────────
  const totalPuntos = useMemo(() =>
    Math.round(weeks.reduce((s, w) => s + (Number(w.data['puntos']) || 0), 0) * 100) / 100
  , [weeks]);

  const totalPonderacion = useMemo(() =>
    Math.round((totalPuntos / 20) * 100 * 100) / 100
  , [totalPuntos]);

  // ── Helpers: column mutations ─────────────────
  const addColumn = useCallback(() => {
    const key = `custom_${Date.now()}`;
    setColumns(prev => [...prev, { key, label: 'Nueva Columna', mergeable: false, numeric: false }]);
  }, []);

  const removeColumn = useCallback((key: string) => {
    setColumns(prev => prev.filter(c => c.key !== key));
  }, []);

  const renameColumn = useCallback((key: string, label: string) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, label } : c));
  }, []);

  /**
   * ORDENAR LAS COLUMNAS
   *
   * Arrastrando la manija de la cabecera (ratón), con las flechas ← → sobre
   * ella (teclado) o, en el teléfono, con «subir/bajar» en «Campos del plan».
   * El orden se guarda con el plan (`customColumns`).
   */
  const moverColumna = useCallback((desde: number, hasta: number) => {
    setColumns(prev => {
      if (desde === hasta || desde < 0 || hasta < 0 || desde >= prev.length || hasta >= prev.length) return prev;
      const nuevas = [...prev];
      const [movida] = nuevas.splice(desde, 1);
      nuevas.splice(hasta, 0, movida);
      return nuevas;
    });
  }, []);
  const [agarrada, setAgarrada] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);
  const soltarColumna = useCallback(() => {
    setAgarrada(null);
    setEncima(null);
  }, []);

  const resetColumns = useCallback(() => {
    setColumns([...DEFAULT_PLAN_COLUMNS]);
  }, []);

  /**
   * SI UN CAMPO ABARCA VARIAS SEMANAS O ES DE CADA SEMANA
   *
   * Venía fijo en el código para dos columnas concretas —tema generador y
   * tejido temático—, así que una columna añadida por el profesor no podía
   * abarcar nunca, y las dos de fábrica no podían dejar de hacerlo. Es una
   * decisión suya, no nuestra.
   */
  const cambiarSiAbarca = useCallback((key: string, abarca: boolean) => {
    setColumns(prev => prev.map(c => (c.key === key ? { ...c, mergeable: abarca } : c)));
    if (!abarca) {
      // Deja de abarcar: se sueltan las semanas que tenía cogidas, o
      // quedarían escondidas sin nada que las enseñe.
      setWeeks(prev =>
        prev.map(w => {
          const colSpan = { ...w.colSpan };
          delete colSpan[key];
          return { ...w, colSpan };
        })
      );
    }
  }, []);

  // ── Helpers: cell mutation ────────────────────
  const setCell = useCallback((weekIdx: number, colKey: string, value: string | number) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      next[weekIdx].data[colKey] = value;
      if (colKey === 'puntos') {
        const pts = Number(value);
        if (!isNaN(pts) && pts > 0) {
          next[weekIdx].data['ponderacion'] = Math.round((pts / 20) * 100 * 100) / 100;
        } else {
          next[weekIdx].data['ponderacion'] = 0;
        }
      }
      return next;
    });
  }, []);

  /** Expand a cell span downward by 1 for a given col */
  const expandCell = useCallback((weekIdx: number, colKey: string) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      const currentSpan = next[weekIdx].colSpan[colKey] || 1;
      const newSpan = Math.min(currentSpan + 1, totalWeeks - weekIdx);
      next[weekIdx].colSpan[colKey] = newSpan;
      // Clear data in absorbed rows so they know they are merged
      for (let i = weekIdx + 1; i < weekIdx + newSpan && i < next.length; i++) {
        delete next[i].data[colKey];
        next[i].colSpan[colKey] = 0; // 0 = hidden (absorbed)
      }
      return next;
    });
  }, [totalWeeks]);

  /** Collapse a cell span by 1 */
  const collapseCell = useCallback((weekIdx: number, colKey: string) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      const currentSpan = next[weekIdx].colSpan[colKey] || 1;
      if (currentSpan <= 1) return next;
      const newSpan = currentSpan - 1;
      // Re-enable the last absorbed row
      const lastAbsorbed = weekIdx + currentSpan - 1;
      if (lastAbsorbed < next.length) {
        next[lastAbsorbed].colSpan[colKey] = 1;
      }
      next[weekIdx].colSpan[colKey] = newSpan;
      return next;
    });
  }, []);

  /**
   * ALARGAR O ACORTAR UN BLOQUE
   *
   * En la tabla, unir celdas se hace columna a columna con un botón que sale
   * al pasar el cursor. De pie no hay cursor y no hay tabla: hay bloques, y un
   * bloque se alarga entero. Se aplica a las columnas que abarcan semanas
   * —las `mergeable`—, que es lo mismo que se guarda.
   */
  const alargarBloque = useCallback((indice: number) => {
    columns.filter(c => c.mergeable).forEach(col => expandCell(indice, col.key));
  }, [columns, expandCell]);

  const acortarBloque = useCallback((indice: number) => {
    columns.filter(c => c.mergeable).forEach(col => collapseCell(indice, col.key));
  }, [columns, collapseCell]);

  const fechasDeLaSemana = useCallback(
    (numero: number) => getWeekDates(autoPopulated?.lapsoStartDate, numero),
    [autoPopulated?.lapsoStartDate]
  );

  // ── Auto-distribute ───────────────────────────
  const distributeEqually = useCallback(() => {
    const activeIdxs = weeks
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => {
        const hasActivity = columns.some(c => !c.numeric && w.data[c.key] && String(w.data[c.key]).trim());
        return hasActivity;
      })
      .map(({ i }) => i);

    if (activeIdxs.length === 0) return;

    const count = activeIdxs.length;
    const ptPerItem = Math.floor((20 / count) * 100) / 100;

    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      let accumulatedPt = 0;

      activeIdxs.forEach((idx, i) => {
        const isLast = i === count - 1;
        const currentPt = isLast ? Math.round((20 - accumulatedPt) * 100) / 100 : ptPerItem;
        accumulatedPt = Math.round((accumulatedPt + currentPt) * 100) / 100;
        const currentPond = Math.round((currentPt / 20) * 100 * 100) / 100;

        next[idx].data['puntos'] = currentPt;
        next[idx].data['ponderacion'] = currentPond;
      });
      return next;
    });
  }, [weeks, columns]);

  // ── Save ──────────────────────────────────────
  const fotoDelEditor = () =>
    JSON.stringify([weekRowsToDbRows(weeks, totalWeeks), columns, localMeta]);

  const empezarAEditar = () => {
    versionAlEditar.current = rowsData?.version;
    comoEstabaAlEditar.current = fotoDelEditor();
    setChoque(null);
    setIsEditing(true);
  };

  const salirDelEditor = () => {
    if (fotoDelEditor() !== comoEstabaAlEditar.current &&
        !window.confirm('Tienes cambios sin guardar en el plan. ¿Salir y perderlos?')) {
      return;
    }
    setChoque(null);
    setIsEditing(false);
  };

  /** Tras un choque: se deja lo de aquí y se carga lo que se guardó en el otro sitio. */
  const cargarLoGuardado = async () => {
    setChoque(null);
    setIsEditing(false);
    await queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
    await queryClient.invalidateQueries({ queryKey: ['evaluationPlanMetadata'] });
  };

  const handleSave = async () => {
    try {
      // Primero las filas: son el trabajo del profesor, y es donde se
      // comprueba que nadie guardó entretanto. Si choca, no se guarda nada.
      const dbRows = weekRowsToDbRows(weeks, totalWeeks);
      const guardado = await saveRows({ classroomId, subjectId, lapso, rows: dbRows, version: versionAlEditar.current });
      versionAlEditar.current = guardado?.version;
      await saveMeta({
        classroomId, subjectId, lapso,
        ...localMeta,
        customColumns: JSON.stringify(columns),
      });
      setChoque(null);
      setIsEditing(false);
      if ((guardado as any)?.pendiente) {
        toast('Sin conexión: el plan quedó pendiente ⏱ y se envía solo al volver.', { id: 'pendiente' });
      } else {
        toast.success('Plan de evaluación guardado');
      }
    } catch (error: any) {
      const datos = error?.response?.data;
      // Una evaluación con notas puestas no se quita ni se deja sin puntos:
      // no es un choque con otra pestaña, es algo que el profesor arregla aquí.
      if (datos?.code === 'EVALUACION_CON_NOTAS') {
        toast.error(datos.error, { duration: 12000 });
        return;
      }
      if (error?.response?.status === 409) {
        setChoque(datos?.error || 'Este plan se guardó desde otro sitio mientras lo editabas.');
        return;
      }
      // El motivo exacto (p. ej. «la suma de puntos es 18 y debe ser 20») es
      // lo que el profesor necesita para arreglarlo: se enseña tal cual.
      toast.error(datos?.error || datos?.message || 'No se pudo guardar el plan de evaluación. Tus cambios siguen en pantalla.');
    }
  };

  const handleMetaChange = (field: string, value: any) => {
    setLocalMeta(prev => ({ ...prev, [field]: value }));
  };

  // Lo que dice la cabecera de la vista: cuántas evaluaciones y lo hecho del lapso.
  const evaluacionesDelPlan = weeks.filter((w) => Number(w.data['puntos']) > 0).length;
  // Igual que la pestaña Actividades: la que va unida a una fila del plan es
  // de ese lapso; la suelta, del primero.
  const actividadesDelLapso = useMemo(() => {
    const filas = new Set((rowsData?.rows ?? []).map((r: any) => r.id));
    const delLapso = (actividadesData?.activities ?? []).filter((a) => (a.planRowId ? filas.has(a.planRowId) : selectedLapso === '1'));
    return { creadas: delLapso.length, realizadas: delLapso.filter((a) => a.isDone).length };
  }, [actividadesData, rowsData, selectedLapso]);

    return {
        selectedLapso,
        isLoadingMeta,
        isLoadingRows,
        instrumentosAbierto,
        setInstrumentosAbierto,
        isSavingMeta,
        isSavingRows,
        isEditing,
        choque,
        localMeta,
        weeks,
        columns,
        fileInputRef,
        isImporting,
        copiandoAbierto,
        setCopiandoAbierto,
        verCompleto,
        setVerCompleto,
        destinosElegidos,
        destinos,
        cargandoDestinos,
        copiando,
        alternarDestino,
        cerrarCopiar,
        confirmarCopia,
        handleImportWord,
        autoPopulated,
        totalWeeks,
        totalPuntos,
        totalPonderacion,
        addColumn,
        removeColumn,
        renameColumn,
        moverColumna,
        agarrada,
        setAgarrada,
        encima,
        setEncima,
        soltarColumna,
        resetColumns,
        cambiarSiAbarca,
        setCell,
        expandCell,
        collapseCell,
        alargarBloque,
        acortarBloque,
        fechasDeLaSemana,
        distributeEqually,
        empezarAEditar,
        salirDelEditor,
        cargarLoGuardado,
        handleSave,
        handleMetaChange,
        evaluacionesDelPlan,
        actividadesDelLapso,
    };
}

// ────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────
export const LAPSOS = [
  { id: '1', name: '1er Momento', short: 'I' },
  { id: '2', name: '2do Momento', short: 'II' },
  { id: '3', name: '3er Momento', short: 'III' },
];

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────
type ColDef = PlanColumnDef;
