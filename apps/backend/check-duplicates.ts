import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
    try {
        const subjects = await prisma.subject.findMany({
            select: { id: true, name: true, instituteId: true }
        });

        const seen = new Map<string, { id: string, name: string }>();
        const duplicates: Array<{ name: string, ids: string[] }> = [];

        for (const subject of subjects) {
            const key = `${subject.instituteId}-${subject.name}`;
            if (seen.has(key)) {
                const existing = seen.get(key)!;
                const existingDup = duplicates.find(d => d.name === subject.name);
                if (existingDup) {
                    existingDup.ids.push(subject.id);
                } else {
                    duplicates.push({
                        name: subject.name,
                        ids: [existing.id, subject.id]
                    });
                }
            }
            seen.set(key, { id: subject.id, name: subject.name });
        }

        if (duplicates.length > 0) {
            console.log('⚠️  Duplicados encontrados:');
            for (const dup of duplicates) {
                console.log(`  - "${dup.name}" (${dup.ids.length} copias)`);
                console.log(`    IDs: ${dup.ids.join(', ')}`);
            }
            console.log('\n⚠️  Debes eliminar los duplicados manualmente antes de aplicar la migración');
            console.log('Puedes eliminarlos desde la interfaz o ejecutar:');
            console.log('  npx prisma studio');
        } else {
            console.log('✅ No hay duplicados, seguro aplicar migración');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDuplicates();
