/**
 * Las entidades federales de Venezuela: los 23 estados, el Distrito Capital y
 * las Dependencias Federales. Las usan los datos del plantel y el lugar de
 * nacimiento del alumno (que además puede ser «Exterior»).
 */
export const ENTIDADES_FEDERALES = [
    'Amazonas',
    'Anzoátegui',
    'Apure',
    'Aragua',
    'Barinas',
    'Bolívar',
    'Carabobo',
    'Cojedes',
    'Delta Amacuro',
    'Distrito Capital',
    'Falcón',
    'Guárico',
    'La Guaira',
    'Lara',
    'Mérida',
    'Miranda',
    'Monagas',
    'Nueva Esparta',
    'Portuguesa',
    'Sucre',
    'Táchira',
    'Trujillo',
    'Yaracuy',
    'Zulia',
    'Dependencias Federales',
] as const;

/** Donde puede haber nacido un alumno: una entidad o fuera del país. */
export const ENTIDADES_DE_NACIMIENTO = [...ENTIDADES_FEDERALES, 'Exterior'] as const;

export const esEntidadFederal = (v: unknown): boolean =>
    typeof v === 'string' && (ENTIDADES_FEDERALES as readonly string[]).includes(v);

export const esEntidadDeNacimiento = (v: unknown): boolean =>
    typeof v === 'string' && (ENTIDADES_DE_NACIMIENTO as readonly string[]).includes(v);
