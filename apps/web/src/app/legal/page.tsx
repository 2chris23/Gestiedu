import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MarcoLegal } from '@/components/legal/PaginaLegal';
import { ACTUALIZADO, losDocumentos } from '@/lib/legal/documentos';
import { elTitular } from '@/lib/legal/titular';

export const metadata: Metadata = {
    title: 'Información legal | Gestiedu',
    description: 'Términos y condiciones, privacidad, datos de menores, cookies, seguridad, conservación de datos y demás documentos legales de Gestiedu.',
    robots: { index: true, follow: true },
};

/** Todo lo legal de Gestiedu, cada documento con su página (`lib/legal/documentos.ts`). */
export default function InformacionLegal() {
    const docs = losDocumentos(elTitular());
    return (
        <MarcoLegal>
            <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
                <h1 className="text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Información legal</h1>
                <p className="mt-3 text-lg leading-8 text-slate-600">
                    Cómo funciona Gestiedu, qué se hace con los datos de tu liceo y de tu familia, y qué derechos tienes. Escrito para entenderse.
                </p>
                <p className="mt-2 text-sm text-slate-600">Última actualización: {ACTUALIZADO}</p>
                <ul className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {docs.map((d) => (
                        <li key={d.id}>
                            <Link href={`/legal/${d.id}`} className="flex min-h-[64px] items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                                <span>
                                    <span className="block text-base font-semibold text-slate-900">{d.titulo}</span>
                                    <span className="mt-0.5 block text-sm text-slate-600">{d.resumen}</span>
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </MarcoLegal>
    );
}
