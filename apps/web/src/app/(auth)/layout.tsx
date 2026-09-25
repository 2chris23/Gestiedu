import SinConexionAlEntrar from '@/components/auth/SinConexionAlEntrar';

/**
 * Lo que envuelve la pantalla de entrada. Solo añade una cosa: si se abre la
 * app sin conexión con el liceo y ya había sesión en este dispositivo, se va a
 * lo último guardado (ver `SinConexionAlEntrar`).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <SinConexionAlEntrar />
            {children}
        </>
    );
}
