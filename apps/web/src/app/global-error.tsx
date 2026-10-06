'use client';

/**
 * SI ALGO TUMBA LA APP ENTERA
 *
 * Sin esto, Next enseña su pantalla en inglés («This page couldn't load»), y
 * en la APK no hay barra de direcciones ni nada más que tocar: así se quedó el
 * teléfono de Cristian con la 1.10 (un `.then` sobre algo que no era promesa,
 * en `lib/el-candado.ts`). Esta no lleva los estilos de la app (Next no los
 * carga aquí): todo va en línea.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    if (typeof console !== 'undefined') console.error('La app se cayó:', error?.message);
    return (
        <html lang="es">
            <body
                style={{
                    margin: 0,
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#F3F5F9',
                    fontFamily: 'system-ui, -apple-system, Roboto, sans-serif',
                    color: '#0F172A',
                    padding: '24px',
                    boxSizing: 'border-box',
                }}
            >
                <main style={{ maxWidth: 360, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Algo falló al abrir la app</h1>
                    <p style={{ fontSize: 16, lineHeight: 1.5, color: '#334155', margin: '0 0 24px' }}>
                        Lo que tenías guardado sigue en el teléfono. Vuelve a intentarlo; si se repite, avisa al liceo.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            minHeight: 48,
                            padding: '0 28px',
                            border: 0,
                            borderRadius: 14,
                            background: '#0D47A1',
                            color: '#FFFFFF',
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Volver a intentar
                    </button>
                </main>
            </body>
        </html>
    );
}
