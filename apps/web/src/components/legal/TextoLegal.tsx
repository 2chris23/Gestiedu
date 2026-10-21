import type { Bloque, DocumentoLegal } from '@/lib/legal/documentos';

/**
 * Un documento legal dentro de la app (la ventana de aceptar y Configuración →
 * Legal). El mismo texto que la página pública `/legal/<id>`, sin salir de la
 * app: en la APK, abrir otra página sacaba a la persona del sistema.
 */
function Parrafo({ b }: { b: Bloque }) {
    if (typeof b === 'string') return <p className="text-sm leading-6 text-gray-700">{b}</p>;
    return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-gray-700">
            {b.lista.map((i) => (
                <li key={i}>{i}</li>
            ))}
        </ul>
    );
}

export function TextoLegal({ doc }: { doc: DocumentoLegal }) {
    return (
        <div className="space-y-5">
            {doc.secciones.map((s) => (
                <section key={s.titulo}>
                    <h3 className="text-[15px] font-bold text-gray-900">{s.titulo}</h3>
                    <div className="mt-2 space-y-2">
                        {s.bloques.map((b, i) => (
                            <Parrafo key={i} b={b} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
