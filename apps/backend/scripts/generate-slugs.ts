import { PrismaClient } from '@prisma/client';
import { generateSlug } from '../src/utils/slug';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Generando slugs para secciones existentes...\n');

    const classrooms = await prisma.classroom.findMany({
        select: {
            id: true,
            name: true,
            slug: true,
        },
    });

    console.log(`📊 Encontradas ${classrooms.length} secciones\n`);

    for (const classroom of classrooms) {
        // Si ya tiene slug, saltar
        if (classroom.slug) {
            console.log(`⏭️  ${classroom.name} ya tiene slug: ${classroom.slug}`);
            continue;
        }

        const slug = generateSlug(classroom.name);

        try {
            await prisma.classroom.update({
                where: { id: classroom.id },
                data: { slug },
            });
            console.log(`✅ ${classroom.name} → ${slug}`);
        } catch (error) {
            console.error(`❌ Error al actualizar ${classroom.name}:`, error);
        }
    }

    console.log('\n✨ Proceso completado');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
