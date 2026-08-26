import { platformPrisma } from './src/config/database';

async function main() {
    try {
        console.log('Querying all institutes in platform database...');
        const institutes = await platformPrisma.institute.findMany();
        console.log('Total institutes found:', institutes.length);
        console.log('Institutes list:');
        for (const inst of institutes) {
            console.log(`- ID: ${inst.id}, Name: ${inst.name}, Slug: ${inst.slug}, Subdomain: ${inst.subdomain}, Status: ${inst.status}`);
        }
    } catch (err) {
        console.error('Error querying platform institutes:', err);
    } finally {
        await platformPrisma.$disconnect();
    }
}

main();
