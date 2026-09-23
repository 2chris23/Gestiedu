import { prisma } from '../../src/config/database';
import { apuntarFallo, volcarFallos } from '../../src/utils/fallos-del-servidor';

/**
 * Los errores 500 llegan al panel del superadmin agrupados: una alerta por ruta
 * y liceo, con cuántas veces falló, no una por cada error.
 */
describe('Fallos del servidor, al panel', () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('FALLO-01: tres fallos de la misma ruta son UNA alerta que dice «3»; diez o más, crítica', async () => {
        const antes = await prisma.systemAlert.count({ where: { type: 'SERVER_ERROR' } });

        for (let i = 0; i < 3; i++) apuntarFallo('liceo-a', 'GET', '/api/students');
        for (let i = 0; i < 12; i++) apuntarFallo('liceo-b', 'POST', '/api/grades');

        expect(await volcarFallos()).toBe(2);

        const nuevas = await prisma.systemAlert.findMany({
            where: { type: 'SERVER_ERROR' },
            orderBy: { createdAt: 'desc' },
            take: 2,
        });
        expect(await prisma.systemAlert.count({ where: { type: 'SERVER_ERROR' } })).toBe(antes + 2);

        const deA = nuevas.find((a) => a.message.includes('liceo-a'))!;
        const deB = nuevas.find((a) => a.message.includes('liceo-b'))!;
        expect(deA.message).toMatch(/^3 error/);
        expect(deA.severity).toBe('HIGH');
        expect(deB.message).toMatch(/^12 error/);
        expect(deB.severity).toBe('CRITICAL');

        // Lo volcado no se vuelve a volcar.
        expect(await volcarFallos()).toBe(0);
    });
});
