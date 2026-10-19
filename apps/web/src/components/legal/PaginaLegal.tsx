import Link from 'next/link';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { Pie } from '@/components/landing/Secciones';
import { ACTUALIZADO, type Bloque, type DocumentoLegal } from '@/lib/legal/documentos';

/**
 * LO LEGAL, CON LA FORMA DE LA PORTADA (19-oct-2026)
 *
 * De servidor: el texto sale pintado en el primer byte, se lee sin javascript
 * y se imprime limpio. Siempre en claro (`modo-claro`): es una página pública,
 * como el papel.
 */

function Cabecera() {
    return (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md print:hidden">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex min-h-[44px] items-center gap-2.5" aria-label="Gestiedu, inicio">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <GraduationCap className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-lg font-extrabold tracking-tight text-slate-900">Gestiedu</span>
                </Link>
                <Link href="/legal" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:text-slate-900">
                    Información legal
                </Link>
            </div>
        </header>
    );
}

function Parrafo({ b }: { b: Bloque }) {
    if (typeof b === 'string') return <p className="text-[15px] leading-7 text-slate-700">{b}</p>;
    return (
        <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700 marker:text-indigo-500">
            {b.lista.map((i) => (
                <li key={i}>{i}</li>
            ))}
        </ul>
    );
}

export function MarcoLegal({ children }: { children: React.ReactNode }) {
    return (
        <div className="modo-claro flex min-h-screen flex-col bg-white text-slate-900">
            <Cabecera />
            <main className="flex-1">{children}</main>
            <Pie />
        </div>
    );
}

export function ElDocumento({ doc, otros }: { doc: DocumentoLegal; otros: DocumentoLegal[] }) {
    return (
        <MarcoLegal>
            <article className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
                <Link href="/legal" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900 print:hidden">
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Toda la información legal
                </Link>
                <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{doc.titulo}</h1>
                <p className="mt-3 text-lg leading-8 text-slate-600">{doc.resumen}</p>
                <p className="mt-2 text-sm text-slate-600">
                    Para: {doc.paraQuien} · Última actualización: {ACTUALIZADO}
                </p>
                <div className="mt-10 space-y-10">
                    {doc.secciones.map((s) => (
                        <section key={s.titulo} aria-labelledby={`${doc.id}-${s.titulo}`}>
                            <h2 id={`${doc.id}-${s.titulo}`} className="text-xl font-bold text-slate-900">
                                {s.titulo}
                            </h2>
                            <div className="mt-3 space-y-3">
                                {s.bloques.map((b, i) => (
                                    <Parrafo key={i} b={b} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
                <nav aria-label="Otros documentos legales" className="mt-16 border-t border-slate-200 pt-8 print:hidden">
                    <h2 className="text-base font-bold text-slate-900">Otros documentos</h2>
                    <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
                        {otros.map((o) => (
                            <li key={o.id}>
                                <Link href={`/legal/${o.id}`} className="inline-flex min-h-[44px] items-center text-[15px] text-indigo-700 hover:text-indigo-900">
                                    {o.titulo}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </article>
        </MarcoLegal>
    );
}
