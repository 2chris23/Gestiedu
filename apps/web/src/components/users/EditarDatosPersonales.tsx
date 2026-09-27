'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Lista } from '@/components/ui/lista';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { ENTIDADES_DE_NACIMIENTO } from '@/lib/entidades-federales';
import { getApiErrorMessage } from '@/lib/utils';
import api from '@/lib/axios';

/**
 * EDITAR LOS DATOS DE LA FICHA
 *
 * Crear una cuenta pide lo mínimo (nombre, apellido, correo, cédula,
 * contraseña, rol y sexo); lo demás se completa aquí, cuando haya tiempo:
 * nacimiento, teléfono, dirección y, en un alumno, lo que piden los documentos
 * del Ministerio. Solo el admin: el profesor no edita datos personales, y el
 * alumno ni los suyos. La cédula se cambia aparte («Cambiar cédula»).
 */

export interface DatosDeLaFicha {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    email: string;
    gender?: string | null;
    birthDate?: string | null;
    phone?: string | null;
    address?: string | null;
    nacionalidad?: string | null;
    tipoDeCedula?: string | null;
    lugarDeNacimiento?: string | null;
    entidadDeNacimiento?: string | null;
}

const SIN = '__sin';

export function EditarDatosPersonales({ usuario }: { usuario: DatosDeLaFicha }) {
    const { yo } = useQuienSoy();
    const [abierto, setAbierto] = React.useState(false);
    if (yo?.role !== 'ADMIN') return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
                <Pencil className="h-4 w-4" aria-hidden /> Editar datos
            </button>
            {abierto && <Ventana usuario={usuario} alCerrar={() => setAbierto(false)} />}
        </>
    );
}

function Ventana({ usuario, alCerrar }: { usuario: DatosDeLaFicha; alCerrar: () => void }) {
    const cola = useQueryClient();
    const esAlumno = usuario.role === 'STUDENT';
    const [d, setD] = React.useState({
        firstName: usuario.firstName,
        lastName: usuario.lastName,
        email: usuario.email,
        gender: usuario.gender ?? '',
        birthDate: usuario.birthDate ? usuario.birthDate.slice(0, 10) : '',
        phone: usuario.phone ?? '',
        address: usuario.address ?? '',
        nacionalidad: usuario.nacionalidad ?? '',
        tipoDeCedula: usuario.tipoDeCedula ?? '',
        lugarDeNacimiento: usuario.lugarDeNacimiento ?? '',
        entidadDeNacimiento: usuario.entidadDeNacimiento ?? '',
    });
    const [guardando, setGuardando] = React.useState(false);
    const [error, setError] = React.useState('');
    const poner = (campo: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [campo]: v }));

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setGuardando(true);
        setError('');
        const cuerpo: Record<string, unknown> = {
            firstName: d.firstName.trim(),
            lastName: d.lastName.trim(),
            email: d.email.trim(),
        };
        if (d.phone.trim()) cuerpo.phone = d.phone.trim();
        if (d.address.trim()) cuerpo.address = d.address.trim();
        if (d.gender) cuerpo.gender = d.gender;
        if (d.birthDate) cuerpo.birthDate = d.birthDate;
        if (esAlumno) {
            // Vacío = sin dato (así se borra algo mal puesto).
            cuerpo.nacionalidad = d.nacionalidad;
            cuerpo.tipoDeCedula = d.tipoDeCedula;
            cuerpo.lugarDeNacimiento = d.lugarDeNacimiento.trim();
            cuerpo.entidadDeNacimiento = d.entidadDeNacimiento;
        }
        try {
            await api.put(`/users/${encodeURIComponent(usuario.id)}`, cuerpo);
            toast.success('Datos guardados');
            await Promise.all([
                cola.invalidateQueries({ queryKey: ['usuario', usuario.id] }),
                cola.invalidateQueries({ queryKey: ['recaudos', usuario.id] }),
                cola.invalidateQueries({ queryKey: ['usuarios'] }),
            ]);
            alCerrar();
        } catch (e) {
            setError(getApiErrorMessage(e, 'No se pudieron guardar los datos.'));
        } finally {
            setGuardando(false);
        }
    };

    const campo = 'min-h-[44px]';
    return (
        <Dialog open onOpenChange={(v) => !v && !guardando && alCerrar()}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Datos de {usuario.firstName}</DialogTitle>
                    <DialogDescription>Lo que no se sepa todavía se deja en blanco y se completa otro día.</DialogDescription>
                </DialogHeader>
                <form onSubmit={guardar} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Etiqueta texto="Nombre" para="dp-nombre">
                            <Input id="dp-nombre" value={d.firstName} onChange={(e) => poner('firstName')(e.target.value)} className={campo} required minLength={2} maxLength={50} />
                        </Etiqueta>
                        <Etiqueta texto="Apellido" para="dp-apellido">
                            <Input id="dp-apellido" value={d.lastName} onChange={(e) => poner('lastName')(e.target.value)} className={campo} required minLength={2} maxLength={50} />
                        </Etiqueta>
                        <Etiqueta texto="Correo" para="dp-correo">
                            <Input id="dp-correo" type="email" value={d.email} onChange={(e) => poner('email')(e.target.value)} className={campo} required />
                        </Etiqueta>
                        <div className="space-y-1.5">
                            <span className="text-sm font-semibold text-gray-700">Sexo</span>
                            <Lista
                                etiqueta="Sexo"
                                valor={d.gender || SIN}
                                alCambiar={(v) => poner('gender')(v === SIN ? '' : v)}
                                opciones={[
                                    { valor: SIN, texto: 'Sin indicar' },
                                    { valor: 'MASCULINO', texto: 'Masculino' },
                                    { valor: 'FEMENINO', texto: 'Femenino' },
                                    ...(d.gender === 'OTRO' ? [{ valor: 'OTRO', texto: 'Otro' }] : []),
                                ]}
                            />
                        </div>
                        <Etiqueta texto="Fecha de nacimiento" para="dp-nacimiento">
                            <Input id="dp-nacimiento" type="date" value={d.birthDate} onChange={(e) => poner('birthDate')(e.target.value)} className={campo} />
                        </Etiqueta>
                        <Etiqueta texto="Teléfono" para="dp-telefono">
                            <Input id="dp-telefono" type="tel" value={d.phone} onChange={(e) => poner('phone')(e.target.value)} className={campo} maxLength={20} />
                        </Etiqueta>
                    </div>
                    <Etiqueta texto="Dirección" para="dp-direccion">
                        <Input id="dp-direccion" value={d.address} onChange={(e) => poner('address')(e.target.value)} className={campo} maxLength={255} />
                    </Etiqueta>

                    {esAlumno && (
                        <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3">
                            <legend className="px-1 text-sm font-semibold text-gray-800">Para los documentos del Ministerio</legend>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <span className="text-sm font-semibold text-gray-700">Nacionalidad</span>
                                    <Lista
                                        etiqueta="Nacionalidad"
                                        valor={d.nacionalidad || SIN}
                                        alCambiar={(v) => poner('nacionalidad')(v === SIN ? '' : v)}
                                        opciones={[
                                            { valor: SIN, texto: 'Sin indicar' },
                                            { valor: 'V', texto: 'Venezolana (V)' },
                                            { valor: 'E', texto: 'Extranjera (E)' },
                                        ]}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-sm font-semibold text-gray-700">Se identifica con</span>
                                    <Lista
                                        etiqueta="Se identifica con"
                                        valor={d.tipoDeCedula || SIN}
                                        alCambiar={(v) => poner('tipoDeCedula')(v === SIN ? '' : v)}
                                        opciones={[
                                            { valor: SIN, texto: 'Sin indicar' },
                                            { valor: 'IDENTIDAD', texto: 'Cédula de identidad' },
                                            { valor: 'ESCOLAR', texto: 'Cédula escolar' },
                                        ]}
                                    />
                                </div>
                                <Etiqueta texto="Lugar de nacimiento" para="dp-lugar">
                                    <Input
                                        id="dp-lugar"
                                        value={d.lugarDeNacimiento}
                                        onChange={(e) => poner('lugarDeNacimiento')(e.target.value)}
                                        className={campo}
                                        maxLength={120}
                                        placeholder="Ciudad o pueblo"
                                    />
                                </Etiqueta>
                                <div className="space-y-1.5">
                                    <span className="text-sm font-semibold text-gray-700">Entidad de nacimiento</span>
                                    <Lista
                                        etiqueta="Entidad de nacimiento"
                                        valor={d.entidadDeNacimiento || SIN}
                                        alCambiar={(v) => poner('entidadDeNacimiento')(v === SIN ? '' : v)}
                                        opciones={[{ valor: SIN, texto: 'Sin indicar' }, ...ENTIDADES_DE_NACIMIENTO.map((e) => ({ valor: e, texto: e }))]}
                                    />
                                </div>
                            </div>
                        </fieldset>
                    )}

                    {error && (
                        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                            {error}
                        </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={alCerrar}
                            disabled={guardando}
                            className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Guardar datos
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Etiqueta({ texto, para, children }: { texto: string; para: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={para} className="text-sm font-semibold text-gray-700">
                {texto}
            </label>
            {children}
        </div>
    );
}

export default EditarDatosPersonales;
