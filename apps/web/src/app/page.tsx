import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, GraduationCap } from 'lucide-react';
import { Escaparate } from '@/components/landing/escaparate/Escaparate';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { BotonDelPortal, ProveedorDelPortal } from '@/components/landing/BotonDelPortal';
import { BotonDeContacto } from '@/components/landing/BotonDeContacto';
import { contactoDemo, direccionDelSitio } from '@/components/landing/contacto';
import { ComoSeEmpieza, HechoParaVenezuela, Llamada, ParaQuien, Pie, Preguntas } from '@/components/landing/Secciones';

/**
 * LA PORTADA
 *
 * Es lo que ve un director de liceo que llega a `/`. De servidor: el texto
 * sale pintado en el primer byte y lleva su `metadata`; lo único de navegador
 * son los aparatos que se usan solos (`Escaparate`) y los botones que abren
 * el portal del liceo (`BotonDelPortal`, que conserva `SchoolAccessModal`).
 *
 * Qué dice cada frase y dónde está en el código: `docs/nube/portada.md`.
 */

const TITULO = 'GestiEdu | Sistema de Gestión Escolar para Liceos';
const DESCRIPCION =
    'Sistema de gestión escolar para liceos de Venezuela: asistencia desde el teléfono o por QR, notas y promedios por lapso con la escala del 1 al 20, horarios de mañana y tarde sin choques, mensualidades en dólares o bolívares y representantes al tanto.';

const TITULO_AL_COMPARTIR = 'Gestiedu — tu liceo al día, desde el teléfono de cada profesor';

/**
 * La imagen para compartir es la propia portada (`public/portada-compartir.jpg`,
 * la saca `docs/nube/portada/imagen-para-compartir.mjs`). Solo se anuncia con
 * la dirección del sitio: ver `contacto.ts`.
 */
const SITIO = direccionDelSitio();
const IMAGEN = {
    url: '/portada-compartir.jpg',
    width: 1200,
    height: 630,
    alt: 'La portada de Gestiedu: un portátil, una tableta y un teléfono con el sistema abierto.',
};

export const metadata: Metadata = {
    ...(SITIO ? { metadataBase: SITIO, alternates: { canonical: '/' } } : {}),
    // El mismo título que pone `DynamicTitle` en `/`: si no, parpadea al cargar.
    title: TITULO,
    description: DESCRIPCION,
    applicationName: 'Gestiedu',
    openGraph: {
        type: 'website',
        locale: 'es_VE',
        siteName: 'Gestiedu',
        title: TITULO_AL_COMPARTIR,
        description: DESCRIPCION,
        ...(SITIO ? { url: '/', images: [IMAGEN] } : {}),
    },
    twitter: {
        card: SITIO ? 'summary_large_image' : 'summary',
        title: TITULO_AL_COMPARTIR,
        description: DESCRIPCION,
        ...(SITIO ? { images: [IMAGEN] } : {}),
    },
    robots: { index: true, follow: true },
};

/** Lo que es, para los buscadores. Sin valoraciones ni precios: no los hay. */
const DATOS_ESTRUCTURADOS = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Gestiedu',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, Android',
    inLanguage: 'es-VE',
    description: DESCRIPCION,
    ...(SITIO ? { url: SITIO.href } : {}),
};

function Cabecera() {
    return (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex min-h-[44px] items-center gap-2.5" aria-label="Gestiedu, inicio">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <GraduationCap className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-lg font-extrabold tracking-tight text-slate-900">Gestiedu</span>
                </Link>
                <nav aria-label="Secciones" className="hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex">
                    {[
                        ['#como-funciona', 'Cómo funciona'],
                        ['#funciones', 'Qué resuelve'],
                        ['#para-quien', 'Para quién'],
                        ['#preguntas', 'Preguntas'],
                    ].map(([href, texto]) => (
                        <a key={href} href={href} className="inline-flex min-h-[44px] items-center rounded-lg px-3 hover:text-slate-900">
                            {texto}
                        </a>
                    ))}
                </nav>
                <BotonDelPortal className="px-4">Entrar a mi liceo</BotonDelPortal>
            </div>
        </header>
    );
}

export default function Portada() {
    const contacto = contactoDemo();
    return (
        <ProveedorDelPortal>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS).replace(/</g, '\\u003c') }}
            />
            <div className="flex min-h-screen flex-col bg-white text-slate-900 selection:bg-indigo-600 selection:text-white">
                <Cabecera />

                <main>
                    <section
                        id="como-funciona"
                        aria-labelledby="titulo-portada"
                        className="relative scroll-mt-16 overflow-hidden bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.12),transparent_70%),linear-gradient(to_bottom,#ffffff,#f8fafc)] px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8"
                    >
                        <div className="mx-auto max-w-3xl text-center">
                            <p className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-800">
                                Para liceos de Venezuela · públicos, privados y subsidiados
                            </p>
                            <h1
                                id="titulo-portada"
                                className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl"
                            >
                                Tu liceo al día, desde el teléfono de cada profesor
                            </h1>
                            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
                                El profesor pasa asistencia y carga notas en la misma clase. Los promedios salen solos con las reglas de
                                tu plantel, y la dirección y los representantes lo ven en el momento.
                            </p>
                            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                                {/*
                                 * Una llamada llena y una de contorno, nunca tres. Con un
                                 * contacto configurado, la llena es para quien aún no es
                                 * cliente; si no, la de entrar, y la otra baja a leer.
                                 */}
                                {contacto ? (
                                    <>
                                        <BotonDeContacto enlace={contacto} className="h-12 px-7 text-base" />
                                        <BotonDelPortal variante="contorno" className="h-12 px-7 text-base">
                                            Entrar a mi liceo
                                        </BotonDelPortal>
                                    </>
                                ) : (
                                    <>
                                        <BotonDelPortal className="h-12 px-7 text-base">Entrar a mi liceo</BotonDelPortal>
                                        <a
                                            href="#funciones"
                                            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-7 text-base font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                                        >
                                            Qué resuelve
                                            <ArrowDown className="h-4 w-4" aria-hidden />
                                        </a>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-14 sm:mt-16">
                            <Escaparate />
                        </div>
                    </section>

                    <FeaturesSection />
                    <HechoParaVenezuela />
                    <ParaQuien />
                    <ComoSeEmpieza />
                    <Preguntas />
                    <Llamada contacto={contacto} />
                </main>

                <Pie />
            </div>
        </ProveedorDelPortal>
    );
}
