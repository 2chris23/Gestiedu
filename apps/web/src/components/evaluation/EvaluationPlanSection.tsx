'use client';

import {
    Save,
    ArrowLeft,
    Edit2,
    Maximize2,
    Download,
    Sparkles,
    RotateCcw,
    Zap,
    GripVertical,
    X,
    Upload,
    Copy,
    AlertTriangle,
    ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import PlanPorBloques from './PlanPorBloques';
import PlanEnFilas from './PlanEnFilas';
const InstrumentosDelPlan = dynamic(() => import('./InstrumentosDelPlan'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-sm text-gray-500">Cargando instrumentos de evaluación...</div>,
});
import CamposDelPlan from './CamposDelPlan';
import { PlanCompleto } from './piezas-del-plan';
import { usePlanDeEvaluacion, LAPSOS } from './usePlanDeEvaluacion';
import { renderMembrete, renderViewTable, renderEditTable } from './tablas-del-plan';

// ────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────
export default function EvaluationPlanSection({
  classroomId, subjectId, lapso = '1', canEdit
}: {
  classroomId: string;
  subjectId: string;
  lapso?: string;
  canEdit?: boolean;
}) {
    const c = usePlanDeEvaluacion({ classroomId, subjectId, lapso, canEdit });
    const {
        selectedLapso,
        isLoadingMeta,
        isLoadingRows,
        instrumentosAbierto,
        setInstrumentosAbierto,
        isSavingMeta,
        isSavingRows,
        isEditing,
        choque,
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
        addColumn,
        removeColumn,
        renameColumn,
        moverColumna,
        resetColumns,
        cambiarSiAbarca,
        setCell,
        alargarBloque,
        acortarBloque,
        fechasDeLaSemana,
        distributeEqually,
        empezarAEditar,
        salirDelEditor,
        cargarLoGuardado,
        handleSave,
        evaluacionesDelPlan,
        actividadesDelLapso,
    } = c;

  // ────────────────────────────────────────────────
  // LOADING
  // ────────────────────────────────────────────────
  if (isLoadingMeta || isLoadingRows) {
    return (
      <div className="h-64 flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // EDIT FULL-SCREEN MODE
  // ────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="fixed inset-0 z-[100] bg-gray-100 flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Editor Inmersivo — Plan de Evaluación">
        {/* TOP BAR */}
        <div className="bg-white border-b border-gray-200 shadow-sm min-h-16 flex flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={salirDelEditor} aria-label="Salir del editor" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Editor Inmersivo — Plan de Evaluación</h2>
              <p className="text-xs text-slate-600 font-medium">{autoPopulated.subjectName ? `${autoPopulated.subjectName} · ` : ''}{LAPSOS.find(l => l.id === lapso)?.name} · {totalWeeks} semanas</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".docx"
              ref={fileInputRef}
              onChange={handleImportWord}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              title="Importar un archivo Word (.docx) con una tabla de evaluación"
              className="flex min-h-10 items-center px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-xs font-bold disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-1.5" /> {isImporting ? 'Importando...' : 'Importar Word'}
            </button>
            <button
              onClick={distributeEqually}
              title="Distribuir ponderación y puntos equitativamente entre semanas con actividad"
              className="flex min-h-10 items-center px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-xs font-bold"
            >
              <Zap className="w-4 h-4 mr-1.5" /> Distribuir Equitativamente
            </button>
            <button
              onClick={resetColumns}
              title="Restaurar columnas predeterminadas del Ministerio"
              className="flex min-h-10 items-center px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restaurar Columnas
            </button>
            <button
              onClick={handleSave}
              disabled={isSavingMeta || isSavingRows}
              className="flex min-h-10 items-center px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-bold shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" /> {isSavingRows ? 'Guardando...' : 'Guardar y Cerrar'}
            </button>
          </div>
        </div>

        {choque && (
          <div role="alert" className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900 shrink-0">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <span className="flex-1 min-w-[16rem]">{choque}</span>
            <button
              onClick={cargarLoGuardado}
              className="px-3 py-2 min-h-[44px] rounded-lg border border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
            >
              Descartar mis cambios y cargar lo guardado
            </button>
          </div>
        )}

        {/* HINT BAR */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2 flex items-start gap-2.5 text-xs leading-relaxed text-slate-700 shrink-0">
          <Sparkles className="mt-0.5 w-4 h-4 shrink-0 text-indigo-500" aria-hidden />
          <span>
            Cada fila es una semana. Para que un tema abarque varias, usa <strong>↓</strong> en su celda
            (en el teléfono, <strong>+</strong> y <strong>−</strong> del bloque). Las columnas se cambian de lugar
            arrastrando su manija <GripVertical className="inline w-3.5 h-3.5 align-text-bottom text-slate-500" aria-hidden />;
            se añaden con <strong>+ Columna</strong>.
          </span>
        </div>

        {/* CANVAS */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-4">
            <div className="space-y-3 min-[700px]:hidden">
              {/* Añadir, renombrar y quitar campos: en la tabla eso son dos
                  iconos de 16 px en una cabecera de mil píxeles de ancho, o
                  sea, fuera de la pantalla de cualquier teléfono. */}
              <CamposDelPlan
                columnas={columns}
                alRenombrar={renameColumn}
                alQuitar={removeColumn}
                alAnadir={addColumn}
                alCambiarSiAbarca={cambiarSiAbarca}
                alRestaurar={resetColumns}
                alMover={moverColumna}
              />

              <PlanPorBloques
                semanas={weeks}
                columnas={columns}
                fechasDe={fechasDeLaSemana}
                puedeEditar
                alEscribir={(indice, columna, valor) => setCell(indice, columna, valor)}
                alAlargar={alargarBloque}
                alAcortar={acortarBloque}
              />
            </div>

            <div className="rejilla-densa hidden rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-200 bg-white min-[700px]:block">
              {renderMembrete(c, 'edit')}
              {renderEditTable(c)}
            </div>
            <div className="h-20" />
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // VIEW MODE
  // ────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-col gap-4">
      {/*
          EL PLAN EN LA PANTALLA NO ES EL PAPEL (Cristian, 16-oct-2026)

          Arriba, cuánto se lleva repartido y cuatro accesos: verlo completo
          (la hoja con su membrete, donde se deja girar el teléfono),
          descargarlo, copiarlo y editarlo. Debajo, las semanas en filas, como
          los Movimientos de Finanzas. Sin «¿Cómo funciona?»: ya está el «?» de
          arriba.
      */}
      <div className="rounded-[24px] bg-white p-4 ring-1 ring-gray-200 print:hidden">
        {/* Lo que se lleva hecho del lapso (Cristian, 17-oct-2026): las
            actividades creadas en la clase y cuántas ya se realizaron. Los
            puntos repartidos ya se ven en cada semana. */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Actividades del lapso</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
              {actividadesDelLapso.realizadas}{' '}
              <span className="text-base font-semibold text-gray-500">de {actividadesDelLapso.creadas} realizadas</span>
            </p>
          </div>
          <p className="shrink-0 text-right text-sm text-gray-600">
            {evaluacionesDelPlan} {evaluacionesDelPlan === 1 ? 'evaluación' : 'evaluaciones'}
            <br />
            {weeks.length} semanas
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${actividadesDelLapso.creadas > 0 && actividadesDelLapso.realizadas === actividadesDelLapso.creadas ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${actividadesDelLapso.creadas ? Math.min(100, (actividadesDelLapso.realizadas / actividadesDelLapso.creadas) * 100) : 0}%` }}
          />
        </div>
        {/* El liceo puso semanas antes del plan (diagnóstico): se dice desde
            cuándo cuenta la Semana 1. */}
        {autoPopulated?.inicioDelLapso && autoPopulated?.lapsoStartDate &&
          String(autoPopulated.lapsoStartDate).slice(0, 10) > String(autoPopulated.inicioDelLapso).slice(0, 10) && (
          <p className="mt-2 text-xs text-amber-800">
            Semana 1: desde el {String(autoPopulated.lapsoStartDate).slice(0, 10).split('-').reverse().join('/')}. Antes, {(autoPopulated.nombreAntesDelPlan || 'Diagnóstico').toLowerCase()}.
          </p>
        )}

        <nav className="-mx-2 mt-4 grid grid-cols-5 lateral:mx-0 lateral:flex lateral:gap-2" aria-label="Acciones del plan">
          {[
            { id: 'ver', nombre: 'Ver todo', rotulo: 'Ver todo el plan', icono: Maximize2, alPulsar: () => setVerCompleto(true), soloTelefono: true },
            { id: 'bajar', nombre: 'Descargar', rotulo: 'Descargar el plan', icono: Download, href: `/dashboard/plan-de-evaluacion/${encodeURIComponent(classroomId)}/${encodeURIComponent(subjectId)}?lapso=${selectedLapso}`, recorrido: 'plan-imprimir' },
            ...(canEdit ? [{ id: 'copiar', nombre: 'Copiar', rotulo: 'Copiar a otra sección', icono: Copy, alPulsar: () => setCopiandoAbierto(true), recorrido: 'plan-copiar' }] : []),
            ...(canEdit ? [{ id: 'editar', nombre: 'Editar', rotulo: 'Editar el plan', icono: Edit2, alPulsar: empezarAEditar, recorrido: 'plan-editar', principal: true }] : []),
            { id: 'instrumentos', nombre: 'Instrumentos', rotulo: 'Instrumentos de evaluación', icono: ClipboardList, alPulsar: () => setInstrumentosAbierto(true) },
          ].map((a: any) => {
            const Icono = a.icono;
            const dentro = (
              <>
                <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-[18px] transition-[transform,background-color,box-shadow,color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_6px_14px_-6px_rgba(13,71,161,0.35)] group-active:translate-y-0 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-indigo-500 group-focus-visible:ring-offset-2 motion-reduce:transform-none ${a.principal ? 'bg-indigo-600 text-white group-hover:bg-indigo-700' : 'bg-gray-100 text-cabecera-tinta group-hover:bg-indigo-50 group-hover:text-indigo-700'}`}>
                  <Icono className="h-[22px] w-[22px]" aria-hidden />
                </span>
                <span className="whitespace-nowrap text-xs font-medium leading-tight tracking-tight text-gray-800">{a.nombre}</span>
              </>
            );
            const clases = `group flex min-h-[44px] min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 text-center outline-none focus-visible:outline-none lateral:w-[92px] ${a.soloTelefono ? 'lateral:hidden' : ''}`;
            return a.href ? (
              <Link key={a.id} href={a.href} className={clases} data-recorrido={a.recorrido} aria-label={a.rotulo}>{dentro}</Link>
            ) : (
              <button key={a.id} type="button" onClick={a.alPulsar} className={clases} data-recorrido={a.recorrido} aria-label={a.rotulo}>{dentro}</button>
            );
          })}
        </nav>
      </div>

      {/* ── Copiar el plan a otras secciones ───────────────────────── */}
      {copiandoAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Copiar plan a otra sección">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Copy className="w-4 h-4 text-indigo-600" /> Copiar plan a otra sección
              </h3>
              <button onClick={cerrarCopiar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[50vh] overflow-auto">
              <p className="text-xs text-gray-500 mb-3">
                Se copia el plan del <strong>{LAPSOS.find(l => l.id === selectedLapso)?.name}</strong> tal como está ahora.
              </p>

              {cargandoDestinos ? (
                <p className="text-xs text-gray-400 py-4 text-center">Buscando tus secciones...</p>
              ) : destinos.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">
                  No hay otra sección donde des esta materia en este año escolar.
                </p>
              ) : (
                <div className="space-y-1">
                  {destinos.map(seccion => (
                    <label
                      key={seccion.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={destinosElegidos.includes(seccion.id)}
                        onChange={() => alternarDestino(seccion.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-800">
                        {seccion.grade}° {seccion.section}
                        <span className="text-xs text-gray-400 ml-2">{seccion.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {destinosElegidos.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    El plan que tengan esas secciones en este lapso se reemplaza por este.
                    Las notas ya puestas no se tocan.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                onClick={cerrarCopiar}
                className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCopia}
                disabled={destinosElegidos.length === 0 || copiando}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiando ? 'Copiando...' : `Copiar${destinosElegidos.length > 0 ? ` a ${destinosElegidos.length}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* En el teléfono, las semanas en filas; en el ordenador (Cristian,
          18-oct-2026), la hoja entera con su membrete: ahí sí cabe. */}
      <div data-recorrido="plan-rejilla">
        <div className="lateral:hidden">
          <PlanEnFilas semanas={weeks} columnas={columns} fechasDe={fechasDeLaSemana} />
        </div>
        <div className="hidden h-[calc(100vh-160px)] min-h-[520px] flex-col overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200 lateral:flex">
          <div className="shrink-0">{renderMembrete(c, 'view')}</div>
          <div className="rejilla-densa min-h-0 flex-1 overflow-hidden">{renderViewTable(c)}</div>
        </div>
      </div>
    </div>

    {/* La hoja completa, con su membrete: aquí sí se deja girar el teléfono. */}
    {verCompleto && (
      <PlanCompleto alCerrar={() => setVerCompleto(false)} titulo={`Plan de evaluación · ${LAPSOS.find(l => l.id === selectedLapso)?.name ?? ''}`}>
        <div className="rejilla-densa min-w-[900px] bg-white">
          {renderMembrete(c, 'view')}
          {renderViewTable(c)}
        </div>
      </PlanCompleto>
    )}
    {/* Los instrumentos, en su ventana (un botón arriba, no una caja debajo del plan). */}
    {instrumentosAbierto && (
      <InstrumentosDelPlan classroomId={classroomId} subjectId={subjectId} lapso={selectedLapso} canEdit={Boolean(canEdit)} alCerrar={() => setInstrumentosAbierto(false)} />
    )}
    </>
  );
}
