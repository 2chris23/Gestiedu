import { camposVistos, sinLosCampos } from './lo-que-se-vio';
import { juntar, type CambioPendiente } from './por-enviar';

/**
 * LA CONFIGURACIÓN SIN CONEXIÓN, CAMPO A CAMPO (2026-09-30)
 *
 * El formulario va entero; lo que viaja con él es lo que se veía de cada
 * campo, para que el servidor no pise lo que otro cambió mientras tanto.
 */
const base = {
    name: 'Liceo Bolívar',
    phone: '0212-1111111',
    configuration: JSON.stringify({ passingGrade: 10, documentos: { municipio: 'Libertador' } }),
};

describe('Lo que se vio de la configuración', () => {
    it('cada campo del cuerpo con lo que había, también dentro de los documentos', () => {
        const vistos = camposVistos(
            { name: 'Liceo Bolívar', phone: '0212-3333333', configuration: { passingGrade: 12, confirmarClasesFuera: true, documentos: { municipio: 'Sucre' } } },
            base
        );
        expect(vistos).toEqual([
            { campo: 'name', antes: 'Liceo Bolívar', nuevo: 'Liceo Bolívar' },
            { campo: 'phone', antes: '0212-1111111', nuevo: '0212-3333333' },
            { campo: 'configuration.passingGrade', antes: 10, nuevo: 12 },
            { campo: 'configuration.documentos.municipio', antes: 'Libertador', nuevo: 'Sucre' },
        ]);
    });

    it('«lo del otro» saca el campo del cambio y de lo visto', () => {
        const datos = { phone: '1', configuration: { documentos: { municipio: 'Sucre', parroquia: 'X' } }, __visto: [{ campo: 'phone' }, { campo: 'configuration.documentos.municipio' }] };
        const sin = sinLosCampos(datos, ['configuration.documentos.municipio']);
        expect(sin.configuration.documentos).toEqual({ parroquia: 'X' });
        expect(sin.__visto).toEqual([{ campo: 'phone' }]);
        expect(datos.configuration.documentos.municipio).toBe('Sucre'); // el original no se toca
    });

    it('dos cambios sin conexión se suman y cada campo guarda lo PRIMERO que se vio', () => {
        const c = (datos: any, orden: number): CambioPendiente => ({
            id: `c${orden}`,
            dueno: 'liceo:admin',
            tipo: 'config',
            grupo: 3,
            metodo: 'put',
            url: '/institutes/current/config',
            objeto: 'config|liceo',
            resumen: '',
            hechoEn: '',
            orden,
            estado: 'pendiente',
            intentos: 0,
            datos,
        });
        const uno = c({ phone: '2', __visto: [{ campo: 'phone', antes: '1', nuevo: '2' }] }, 1);
        const dos = c(
            { phone: '3', configuration: { documentos: { parroquia: 'X' } }, __visto: [{ campo: 'phone', antes: '2', nuevo: '3' }, { campo: 'configuration.documentos.parroquia', antes: null, nuevo: 'X' }] },
            2
        );
        const [junto, ...resto] = juntar([uno], dos);
        expect(resto).toEqual([]);
        expect(junto.datos.phone).toBe('3');
        expect(junto.datos.configuration.documentos).toEqual({ parroquia: 'X' });
        expect(junto.datos.__visto).toEqual([
            { campo: 'phone', antes: '1', nuevo: '3' },
            { campo: 'configuration.documentos.parroquia', antes: null, nuevo: 'X' },
        ]);
    });
});
