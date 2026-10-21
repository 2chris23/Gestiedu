import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ElDocumento } from '@/components/legal/PaginaLegal';
import { losDocumentos, unDocumento } from '@/lib/legal/documentos';
import { elTitular } from '@/lib/legal/titular';

/** Una página por documento legal, pintada al compilar. */
export function generateStaticParams() {
    return losDocumentos(elTitular()).map((d) => ({ documento: d.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ documento: string }> }): Promise<Metadata> {
    const doc = unDocumento(elTitular(), (await params).documento);
    return doc ? { title: `${doc.titulo} | Gestiedu`, description: doc.resumen, robots: { index: true, follow: true } } : {};
}

export default async function DocumentoLegalPage({ params }: { params: Promise<{ documento: string }> }) {
    const t = elTitular();
    const id = (await params).documento;
    const doc = unDocumento(t, id);
    if (!doc) notFound();
    return <ElDocumento doc={doc} otros={losDocumentos(t).filter((d) => d.id !== id)} />;
}
