/**
 * GESTIEDU — LA PALETA, EN UN SOLO SITIO
 *
 * Los colores NO se escriben aquí: viven en `src/app/globals.css` como
 * variables, y aquí solo se les pone nombre para poder escribirlos en las
 * clases. Así el modo claro y el oscuro cambian solos, sin duplicar nada.
 *
 * Cinco colores y el gris. Si hace falta un sexto, algo se está explicando mal.
 *
 * @type {import('tailwindcss').Config}
 */
const conVariable = (nombre) => `hsl(var(${nombre}) / <alpha-value>)`;

module.exports = {
    darkMode: ['class'],
    /**
     * EL HOVER QUE SE QUEDA PEGADO
     *
     * El teléfono no tiene ratón, así que finge uno: el primer toque aplica el
     * `:hover` y **lo deja puesto** hasta que se toca en otro sitio. Una tarjeta
     * que se levanta al pasar el ratón se queda levantada después de tocarla, y
     * parece rota.
     *
     * Con esto, cada `hover:` que escribe Tailwind sale envuelto en
     * `@media (hover: hover)`: solo se aplica donde hay un puntero de verdad.
     * Al dedo se le responde por `:active`, que sí funciona en todas partes.
     */
    future: {
        hoverOnlyWhenSupported: true,
    },
    content: [
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            /**
             * LA BARRA LATERAL ES DE LA TABLETA Y EL ORDENADOR, NO DEL TELÉFONO
             *
             * Se decidía solo por el ancho (`lg`, 1024 px), y un teléfono
             * TUMBADO pasa de 1024: el Motorola de lado enseñaba la barra
             * lateral, que se comía un cuarto de una pantalla de 400 px de
             * alto. Un teléfono tumbado se distingue por el dedo y la poca
             * altura; una tableta tumbada pasa de 600 px de alto.
             *
             * `lateral:` = hay sitio para la barra lateral: ancho de ordenador
             * con ratón, o ancho de tableta y además alto de tableta.
             */
            screens: {
                lateral: {
                    raw: '(min-width: 1024px) and (pointer: fine), (min-width: 1024px) and (min-height: 600px)',
                },
            },
            colors: {
                // ── El papel y la tinta ──────────────────────────────────
                lienzo: {
                    DEFAULT: conVariable('--lienzo'),
                    hundido: conVariable('--lienzo-hundido'),
                },
                tarjeta: {
                    DEFAULT: conVariable('--tarjeta'),
                    alta: conVariable('--tarjeta-alta'),
                },
                tinta: {
                    DEFAULT: conVariable('--tinta'),
                    suave: conVariable('--tinta-suave'),
                    tenue: conVariable('--tinta-tenue'),
                },
                linea: {
                    DEFAULT: conVariable('--linea'),
                    fuerte: conVariable('--linea-fuerte'),
                },

                // ── 1. ÍNDIGO — lo que se pulsa ──────────────────────────
                indigo: {
                    claro: conVariable('--indigo-claro'),
                    suave: conVariable('--indigo-suave'),
                    DEFAULT: conVariable('--indigo'),
                    hondo: conVariable('--indigo-hondo'),
                    encima: conVariable('--indigo-encima'),
                },
                // ── 2. MENTA — va bien ───────────────────────────────────
                menta: {
                    claro: conVariable('--menta-claro'),
                    suave: conVariable('--menta-suave'),
                    DEFAULT: conVariable('--menta'),
                    hondo: conVariable('--menta-hondo'),
                    encima: conVariable('--menta-encima'),
                },
                // ── 3. ÁMBAR — ojo ───────────────────────────────────────
                ambar: {
                    claro: conVariable('--ambar-claro'),
                    suave: conVariable('--ambar-suave'),
                    DEFAULT: conVariable('--ambar'),
                    hondo: conVariable('--ambar-hondo'),
                    encima: conVariable('--ambar-encima'),
                },
                // ── 4. CORAL — va mal ────────────────────────────────────
                coral: {
                    claro: conVariable('--coral-claro'),
                    suave: conVariable('--coral-suave'),
                    DEFAULT: conVariable('--coral'),
                    hondo: conVariable('--coral-hondo'),
                    encima: conVariable('--coral-encima'),
                },
                // ── 5. CIAN — información ────────────────────────────────
                cian: {
                    claro: conVariable('--cian-claro'),
                    suave: conVariable('--cian-suave'),
                    DEFAULT: conVariable('--cian'),
                    hondo: conVariable('--cian-hondo'),
                    encima: conVariable('--cian-encima'),
                },

                // ── Puente con shadcn/ui ─────────────────────────────────
                // Lo ya escrito sigue funcionando; por debajo son los de arriba.
                background: conVariable('--lienzo'),
                foreground: conVariable('--tinta'),
                card: {
                    DEFAULT: conVariable('--tarjeta'),
                    foreground: conVariable('--tinta'),
                },
                popover: {
                    DEFAULT: conVariable('--tarjeta-alta'),
                    foreground: conVariable('--tinta'),
                },
                /**
                 * Los números (primary-50 … primary-900) los usan 51 sitios de
                 * las pantallas viejas. Al pasar a la paleta nueva se quedaron
                 * sin definir, y Tailwind no avisa: la clase simplemente no
                 * pinta. "+ Nuevo Ciclo" quedó con letra blanca sobre gris,
                 * invisible (1,1:1). Vuelven con su definición de antes, que
                 * sigue el color del liceo (`--primary`, ver DynamicColors).
                 */
                /**
                 * Los -600 de verde, esmeralda, ámbar, amarillo y naranja de
                 * Tailwind NO llegan a 4,5:1 sobre blanco (el verde, 3,3:1), y las
                 * pantallas viejas los usan como texto de estado ("aprobado",
                 * "al día"). Se oscurecen al tono -700, que sí llega. Un botón
                 * con fondo -600 y letra blanca también gana contraste.
                 */
                green: { 600: '#15803d' },
                emerald: { 600: '#047857' },
                amber: { 600: '#b45309' },
                yellow: { 600: '#a16207' },
                orange: { 600: '#c2410c' },
                primary: {
                    50: 'hsl(var(--primary) / 0.05)',
                    100: 'hsl(var(--primary) / 0.1)',
                    200: 'hsl(var(--primary) / 0.2)',
                    300: 'hsl(var(--primary) / 0.3)',
                    400: 'hsl(var(--primary) / 0.4)',
                    500: 'hsl(var(--primary) / 0.7)',
                    600: 'hsl(var(--primary))',
                    700: 'hsl(var(--primary) / 0.9)',
                    800: 'hsl(var(--primary) / 0.95)',
                    900: 'hsl(var(--primary) / 1)',
                    DEFAULT: conVariable('--indigo'),
                    foreground: conVariable('--indigo-encima'),
                },
                secondary: {
                    DEFAULT: conVariable('--lienzo-hundido'),
                    foreground: conVariable('--tinta'),
                },
                muted: {
                    DEFAULT: conVariable('--lienzo-hundido'),
                    foreground: conVariable('--tinta-suave'),
                },
                accent: {
                    DEFAULT: conVariable('--indigo-claro'),
                    foreground: conVariable('--indigo-hondo'),
                },
                destructive: {
                    DEFAULT: conVariable('--coral'),
                    foreground: conVariable('--coral-encima'),
                },
                border: conVariable('--linea'),
                input: conVariable('--linea'),
                ring: conVariable('--anillo'),
                chart: {
                    1: conVariable('--indigo'),
                    2: conVariable('--menta'),
                    3: conVariable('--ambar'),
                    4: conVariable('--cian'),
                    5: conVariable('--coral'),
                },
            },

            borderRadius: {
                xs: 'var(--curva-xs)',
                sm: 'var(--curva-sm)',
                DEFAULT: 'var(--curva)',
                md: 'var(--curva-sm)',
                lg: 'var(--curva)',
                xl: 'var(--curva-lg)',
                '2xl': 'var(--curva-xl)',
                pastilla: 'var(--curva-pastilla)',
            },

            boxShadow: {
                1: 'var(--sombra-1)',
                2: 'var(--sombra-2)',
                3: 'var(--sombra-3)',
                dentro: 'var(--sombra-dentro)',
                pulsado: 'var(--sombra-pulsado)',
                none: 'none',
            },

            fontFamily: {
                sans: ['var(--fuente-texto)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },

            fontSize: {
                /**
                 * ESCALA CORTA, Y MÁS PEQUEÑA DE LO QUE PARECE QUE DEBERÍA
                 *
                 * La primera versión iba grande —cuerpo a 15, títulos a 24— y
                 * en el teléfono se comía la pantalla: tres tarjetas y a
                 * desplazar. Un sistema de gestión enseña MUCHO dato por
                 * pantalla; no es una portada.
                 *
                 * Lo que sostiene la jerarquía aquí es el **peso** y el
                 * **espacio**, no el tamaño. Por eso los saltos son cortos.
                 */
                micro: ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.04em' }],
                etiqueta: ['0.75rem', { lineHeight: '1.05rem', letterSpacing: '0.01em' }],
                cuerpo: ['0.875rem', { lineHeight: '1.3125rem' }],
                titulo: ['1rem', { lineHeight: '1.375rem', letterSpacing: '-0.01em' }],
                seccion: ['1.1875rem', { lineHeight: '1.5rem', letterSpacing: '-0.02em' }],
                pantalla: ['1.5rem', { lineHeight: '1.8125rem', letterSpacing: '-0.025em' }],
            },

            transitionTimingFunction: {
                // Sale rápido y frena despacio: se siente ligero, no perezoso.
                suave: 'cubic-bezier(0.22, 1, 0.36, 1)',
            },

            keyframes: {
                aparecer: {
                    from: { opacity: '0', transform: 'translateY(6px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                latir: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.45' },
                },
                brillo: {
                    '100%': { transform: 'translateX(100%)' },
                },
            },
            animation: {
                aparecer: 'aparecer 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
                latir: 'latir 1.8s ease-in-out infinite',
                brillo: 'brillo 1.4s infinite',
            },
        },
    },
    plugins: [
        require('tailwindcss-animate'),
        // Permite `@md:`, `@lg:`… que miran el ANCHO DEL CONTENEDOR, no el de la
        // ventana. Es lo que hace que una tabla metida en una columna estrecha
        // se comporte como en un teléfono, aunque la pantalla sea enorme.
        require('@tailwindcss/container-queries'),
    ],
};
