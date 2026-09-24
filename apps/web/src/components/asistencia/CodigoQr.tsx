'use client';

import * as React from 'react';
import QRCode from 'qrcode';

/**
 * UN QR DIBUJADO EN EL TELÉFONO
 *
 * Sin servicios de fuera: se dibuja aquí mismo (`qrcode`). Un QR que se pide a
 * una web ajena es un código de asistencia paseándose por internet.
 *
 * Negro sobre blanco y con margen: es lo que mejor lee una cámara barata con
 * poca luz, que es lo que hay en un salón.
 */
export function CodigoQr({ texto, tamano = 320, etiqueta }: { texto: string; tamano?: number; etiqueta: string }) {
    const [imagen, setImagen] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        QRCode.toDataURL(texto, { errorCorrectionLevel: 'M', margin: 2, width: tamano * 2, color: { dark: '#000000', light: '#ffffff' } })
            .then((url) => vivo && setImagen(url))
            .catch(() => vivo && setImagen(null));
        return () => {
            vivo = false;
        };
    }, [texto, tamano]);

    return (
        <div className="aspect-square w-full rounded-2xl bg-white p-2" style={{ maxWidth: tamano }}>
            {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt={etiqueta} className="h-full w-full [image-rendering:pixelated]" />
            ) : (
                <div className="h-full w-full rounded-xl bg-gray-100" aria-label={etiqueta} />
            )}
        </div>
    );
}

export default CodigoQr;
