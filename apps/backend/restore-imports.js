const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, 'src');

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walk(filePath);
        } else if (file.endsWith('.ts')) {
            processFile(filePath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if it imports from prisma-enums
    if (content.includes('prisma-enums')) {
        console.log(`Restoring ${filePath}`);

        // This is a rough heuristic: replace any import from '...prisma-enums' 
        // with import from '@prisma/client'

        // Regex to capture the named imports
        const enumImportRegex = /import\s+{([^}]+)}\s+from\s+['"][^'"]+prisma-enums['"]/;
        const match = content.match(enumImportRegex);

        if (match) {
            const importedItems = match[1].trim();

            // Remove the import line
            content = content.replace(match[0], '');

            // We need to merge these imports into the existing @prisma/client import if it exists,
            // or create a new one.

            const clientImportRegex = /import\s+{([^}]+)}\s+from\s+['"]@prisma\/client['"]/;
            const clientMatch = content.match(clientImportRegex);

            if (clientMatch) {
                // Merge
                const existingItems = clientMatch[1].trim();
                const newImportLine = `import { ${existingItems}, ${importedItems} } from '@prisma/client'`;
                content = content.replace(clientMatch[0], newImportLine);
            } else {
                // Create new
                const newImportLine = `import { ${importedItems} } from '@prisma/client';`;
                content = newImportLine + '\n' + content.trimStart();
            }

            fs.writeFileSync(filePath, content);
        }
    }
}

walk(rootDir);
console.log('Restoration complete');
