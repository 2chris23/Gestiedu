/**
 * LAS FRANJAS DEL HORARIO DEL LICEO, A PRUEBA DE ERRORES
 *
 * El admin decía a qué hora empieza el día, cuánto dura una hora de clase,
 * cuántas hay y dónde va el recreo. La hora de FIN no la decía nadie: salía de
 * la cuenta, y nada impedía un horario imposible —horas de 40 minutos en un
 * liceo que acaba a las 12:30 dejaban 35 minutos colgando al final del día—.
 * La tarde ni se podía configurar: empezaba a las 13:00 fijas.
 *
 * Ahora, por turno (mañana y tarde), el admin pone lo que sabe de memoria: a
 * qué hora empieza, a qué hora acaba, cuánto dura una hora de clase y sus
 * recreos. **El número de horas lo calcula el sistema**, y si no cuadra —sobran
 * o faltan minutos— no se guarda: se dice cuánto sobra y a qué hora tendría que
 * acabar para que cuadre.
 *
 * Pura, sin base. Hay una copia en la web (`apps/web/src/lib/franjas-del-horario.ts`)
 * para la vista previa; el servidor es quien decide (`updateInstituteConfig`).
 * Las dos tienen las mismas pruebas.
 */

export type Turno = 'MANANA' | 'TARDE';

export interface Recreo {
    /** Va después de esta hora de clase (1 = después de la primera). */
    despuesDe: number;
    minutos: number;
}

export interface TurnoDelHorario {
    inicio: string; // "HH:MM"
    fin: string; // "HH:MM"
    /** Minutos de una hora de clase. */
    duracion: number;
    recreos: Recreo[];
}

export interface FranjaDelHorario {
    id: string;
    startTime: string;
    endTime: string;
    label: string;
    type: 'class' | 'break';
}

export interface CuentaDelTurno {
    /** Cuántas horas de clase caben (0 si no cuadra). */
    bloques: number;
    franjas: FranjaDelHorario[];
    errores: string[];
}

/** La forma vieja (solo la mañana, con el número de horas en vez de la hora de fin). */
interface HorarioViejo {
    startTime?: string;
    blockDuration?: number;
    totalBlocks?: number;
    breakAfterBlock?: number;
    breakDuration?: number;
}

export interface HorarioDelLiceo extends HorarioViejo {
    turnos?: Partial<Record<Turno, TurnoDelHorario>>;
}

const NOMBRE: Record<Turno, string> = { MANANA: 'la mañana', TARDE: 'la tarde' };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const aMinutos = (h: string) => {
    const [a, b] = h.split(':').map(Number);
    return a * 60 + b;
};
export const aHora = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const ORDINALES = ['0', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma', '11ma', '12ma', '13ra', '14ta', '15ta'];
export const ordinal = (n: number) => ORDINALES[n] || `${n}ª`;

const MANANA_POR_DEFECTO: TurnoDelHorario = {
    inicio: '07:00',
    fin: '12:30',
    duracion: 45,
    recreos: [{ despuesDe: 3, minutos: 15 }],
};

/**
 * La configuración guardada, con los dos turnos. Lo guardado a la vieja (solo
 * la mañana, con el número de horas) se lee como estaba: la mañana acaba donde
 * acababan sus horas, y la tarde es la de siempre desde las 13:00 con el mismo
 * número de horas — así ningún liceo ve moverse su horario al actualizar.
 */
export function turnosDeLaConfig(guardado?: HorarioDelLiceo | null): Record<Turno, TurnoDelHorario> {
    const viejo = guardado ?? {};
    const duracion = Number(viejo.blockDuration) || MANANA_POR_DEFECTO.duracion;
    const horas = Number(viejo.totalBlocks) || 7;
    const recreos: Recreo[] =
        viejo.breakAfterBlock && viejo.breakDuration
            ? [{ despuesDe: Number(viejo.breakAfterBlock), minutos: Number(viejo.breakDuration) }]
            : MANANA_POR_DEFECTO.recreos;
    const largo = (inicio: string) =>
        aHora(aMinutos(inicio) + horas * duracion + recreos.filter((r) => r.despuesDe < horas).reduce((s, r) => s + r.minutos, 0));

    const inicioManana = HORA.test(viejo.startTime ?? '') ? viejo.startTime! : MANANA_POR_DEFECTO.inicio;
    const manana: TurnoDelHorario = guardado?.turnos?.MANANA ?? {
        inicio: inicioManana,
        fin: largo(inicioManana),
        duracion,
        recreos,
    };
    const tarde: TurnoDelHorario = guardado?.turnos?.TARDE ?? {
        inicio: '13:00',
        fin: largo('13:00'),
        duracion,
        recreos,
    };
    return { MANANA: manana, TARDE: tarde };
}

/** Cuántas horas caben en un turno, sus franjas, y qué no cuadra. */
export function calcularTurno(t: TurnoDelHorario, turno: Turno = 'MANANA'): CuentaDelTurno {
    const errores: string[] = [];
    const de = NOMBRE[turno];
    const vacio = (): CuentaDelTurno => ({ bloques: 0, franjas: [], errores });

    if (!HORA.test(t?.inicio ?? '')) errores.push(`La hora de inicio de ${de} no es una hora válida.`);
    if (!HORA.test(t?.fin ?? '')) errores.push(`La hora de fin de ${de} no es una hora válida.`);
    const duracion = Number(t?.duracion);
    if (!Number.isInteger(duracion) || duracion < 15 || duracion > 180) {
        errores.push(`En ${de}, una hora de clase tiene que durar entre 15 y 180 minutos.`);
    }
    const recreos = Array.isArray(t?.recreos) ? t.recreos : [];
    for (const r of recreos) {
        if (!Number.isInteger(Number(r?.minutos)) || r.minutos < 5 || r.minutos > 120) {
            errores.push(`En ${de}, un recreo tiene que durar entre 5 y 120 minutos.`);
        }
        if (!Number.isInteger(Number(r?.despuesDe)) || r.despuesDe < 1) {
            errores.push(`En ${de}, cada recreo va después de una hora de clase (1, 2, 3…).`);
        }
    }
    if (new Set(recreos.map((r) => r.despuesDe)).size !== recreos.length) {
        errores.push(`En ${de} hay dos recreos después de la misma hora.`);
    }
    if (errores.length) return vacio();

    const inicio = aMinutos(t.inicio);
    const fin = aMinutos(t.fin);
    if (fin <= inicio) {
        errores.push(`En ${de}, la hora de fin (${t.fin}) tiene que ser después de la de inicio (${t.inicio}).`);
        return vacio();
    }

    const deRecreo = recreos.reduce((s, r) => s + r.minutos, 0);
    const paraClases = fin - inicio - deRecreo;
    const bloques = Math.floor(paraClases / duracion);
    const sobran = paraClases - bloques * duracion;

    if (bloques < 1) {
        errores.push(`En ${de} no cabe ni una hora de clase de ${duracion} min entre las ${t.inicio} y las ${t.fin}.`);
        return vacio();
    }
    if (bloques > 15) {
        errores.push(`En ${de} salen ${bloques} horas de clase: más de 15. Revisa la duración o la hora de fin.`);
        return vacio();
    }
    if (sobran !== 0) {
        const antes = aHora(fin - sobran);
        const despues = aHora(fin + (duracion - sobran));
        errores.push(
            `En ${de}, entre las ${t.inicio} y las ${t.fin} caben ${bloques} horas de ${duracion} min` +
                (deRecreo ? ` (con ${deRecreo} min de recreo)` : '') +
                ` y sobran ${sobran} min. Para que cuadre, que acabe a las ${antes} o a las ${despues}, ` +
                `o cambia la duración de la clase o de un recreo.`
        );
        return vacio();
    }
    for (const r of recreos) {
        if (r.despuesDe >= bloques) {
            errores.push(
                r.despuesDe === bloques
                    ? `En ${de}, un recreo no puede ir después de la última hora (la ${ordinal(bloques)}).`
                    : `En ${de}, un recreo va después de la ${ordinal(r.despuesDe)} hora, pero solo hay ${bloques}.`
            );
        }
    }
    if (errores.length) return vacio();

    const franjas: FranjaDelHorario[] = [];
    const ordenados = [...recreos].sort((a, b) => a.despuesDe - b.despuesDe);
    let ahora = inicio;
    let numeroDeRecreo = 0;
    for (let i = 1; i <= bloques; i++) {
        franjas.push({ id: `p${i}`, startTime: aHora(ahora), endTime: aHora(ahora + duracion), label: `${ordinal(i)} Hora`, type: 'class' });
        ahora += duracion;
        const recreo = ordenados.find((r) => r.despuesDe === i);
        if (recreo) {
            numeroDeRecreo++;
            franjas.push({
                id: `b${numeroDeRecreo}`,
                startTime: aHora(ahora),
                endTime: aHora(ahora + recreo.minutos),
                label: ordenados.length > 1 ? `Recreo ${numeroDeRecreo}` : 'Recreo',
                type: 'break',
            });
            ahora += recreo.minutos;
        }
    }
    return { bloques, franjas, errores };
}

/** Todo lo que no cuadra del horario del liceo, turno por turno. Vacío = se puede guardar. */
export function erroresDelHorario(guardado: HorarioDelLiceo): string[] {
    const turnos = turnosDeLaConfig(guardado);
    const manana = calcularTurno(turnos.MANANA, 'MANANA');
    const tarde = calcularTurno(turnos.TARDE, 'TARDE');
    const errores = [...manana.errores, ...tarde.errores];
    if (!errores.length && aMinutos(turnos.TARDE.inicio) < aMinutos(turnos.MANANA.fin)) {
        errores.push(
            `La tarde empieza (${turnos.TARDE.inicio}) antes de que acabe la mañana (${turnos.MANANA.fin}).`
        );
    }
    return errores;
}

/**
 * Lo que se guarda: los dos turnos, y la forma vieja rellena con la mañana
 * para lo que todavía la lea (un recreo: el primero).
 */
export function horarioParaGuardar(guardado: HorarioDelLiceo): HorarioDelLiceo {
    const turnos = turnosDeLaConfig(guardado);
    const manana = calcularTurno(turnos.MANANA, 'MANANA');
    const primero = [...turnos.MANANA.recreos].sort((a, b) => a.despuesDe - b.despuesDe)[0];
    return {
        startTime: turnos.MANANA.inicio,
        blockDuration: turnos.MANANA.duracion,
        totalBlocks: manana.bloques,
        breakAfterBlock: primero?.despuesDe ?? 0,
        breakDuration: primero?.minutos ?? 0,
        turnos,
    };
}

/** Las franjas de un turno (INTEGRAL va con la mañana, como hasta ahora). */
export function franjasDelTurno(guardado: HorarioDelLiceo | null | undefined, turno?: string | null): FranjaDelHorario[] {
    const cual: Turno = turno === 'TARDE' ? 'TARDE' : 'MANANA';
    return calcularTurno(turnosDeLaConfig(guardado)[cual], cual).franjas;
}
