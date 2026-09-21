import sharp from 'sharp';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { dibujarIconoDelLiceo } from '../../services/icono-del-liceo.service';

/**
 * EL ICONO DE LA APP SE DIBUJA, NO SE SIRVE
 *
 * Esta dirección se abre SIN sesión —el teléfono pide el icono antes de que
 * nadie entre—, y abre un archivo del disco a partir de un campo de la base. Un
 * `..` en ese campo leería cualquier archivo del servidor, así que eso se
 * comprueba aquí y no "se supone".
 *
 * Y lo que sale tiene que ser cuadrado del tamaño pedido: si se sirviera el
 * logo tal cual, el teléfono lo estiraría o le comería los bordes al recortarlo
 * con su forma.
 */

const CARPETA = join(__dirname, '../../../uploads/institute/logos');
const NOMBRE = 'prueba-icono-liceo.png';

describe('El icono de la app del liceo', () => {
    beforeAll(async () => {
        await mkdir(CARPETA, { recursive: true });
        // Un logo apaisado, como los de verdad.
        const apaisado = await sharp({
            create: { width: 400, height: 120, channels: 4, background: '#ff0000' },
        }).png().toBuffer();
        await writeFile(join(CARPETA, NOMBRE), apaisado);
    });

    afterAll(async () => {
        await rm(join(CARPETA, NOMBRE), { force: true });
    });

    it('ICONO-01: sale cuadrado del tamaño pedido, con el logo entero dentro', async () => {
        const { data, version } = await dibujarIconoDelLiceo(
            `/uploads/institute/logos/${NOMBRE}`,
            '#123456',
            512
        );

        const info = await sharp(data).metadata();
        expect(info.width).toBe(512);
        expect(info.height).toBe(512);
        expect(info.format).toBe('png');
        expect(version).toHaveLength(12);

        // La esquina es el color del liceo: el logo va centrado, no estirado.
        const esquina = await sharp(data).extract({ left: 2, top: 2, width: 2, height: 2 }).raw().toBuffer();
        expect([esquina[0], esquina[1], esquina[2]]).toEqual([0x12, 0x34, 0x56]);
    });

    it('ICONO-02: el liceo sin logo no tiene icono propio, y eso no es un error', async () => {
        await expect(dibujarIconoDelLiceo(null, '#123456', 512)).rejects.toMatchObject({
            code: 'ICON_NOT_AVAILABLE',
            statusCode: 404,
        });
    });

    it('ICONO-03: no se sale de la carpeta de subidas', async () => {
        for (const intento of [
            '/uploads/../../../../Windows/win.ini',
            '/uploads/institute/../../../package.json',
            '/etc/passwd',
            'C:\\Windows\\win.ini',
        ]) {
            await expect(dibujarIconoDelLiceo(intento, '#123456', 512)).rejects.toMatchObject({
                code: 'ICON_NOT_AVAILABLE',
            });
        }
    });

    it('ICONO-04: un archivo que no es una imagen no revienta: no hay icono', async () => {
        const basura = join(CARPETA, 'no-soy-imagen.png');
        await writeFile(basura, 'esto no es una imagen');
        try {
            await expect(
                dibujarIconoDelLiceo('/uploads/institute/logos/no-soy-imagen.png', '#123456', 192)
            ).rejects.toMatchObject({ code: 'ICON_NOT_AVAILABLE' });
        } finally {
            await rm(basura, { force: true });
        }
    });
});
