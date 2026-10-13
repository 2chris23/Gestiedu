import { useEffect, useState } from 'react';

/**
 * ¿YA ARRANCÓ LA PANTALLA EN EL NAVEGADOR?
 *
 * Falso en la pintada del servidor y en la primera del navegador; verdadero
 * después. Para las pantallas que enseñan su esqueleto «mientras carga»: su
 * trozo se hidrata DESPUÉS que el armazón, y para entonces la memoria del
 * teléfono (`MemoriaDelTelefono`) ya devolvió sus datos. El servidor había
 * pintado el esqueleto y el navegador la pantalla entera, y React avisaba
 * «Hydration failed» (el «Issue» rojo que vio Cristian en Finanzas y en el
 * ciclo). Con esto, la primera pintada es el esqueleto en los dos lados.
 */
export function useYaArranco(): boolean {
    const [arranco, setArranco] = useState(false);
    useEffect(() => setArranco(true), []);
    return arranco;
}
