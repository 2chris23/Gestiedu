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

    // Check if it imports things that are now in prisma-enums
    const enums = [
        'UserRole', 'Gender', 'ActivityType', 'ActivityScope',
        'AttendanceStatus', 'DayOfWeek', 'ActionType'
    ];

    // Match import { ... } from '@prisma/client'
    const prismaImportRegex = /import\s+{([^}]+)}\s+from\s+['"]@prisma\/client['"]/;
    const match = content.match(prismaImportRegex);

    if (match) {
        const importedItems = match[1].split(',').map(s => s.trim());
        const localEnums = importedItems.filter(item => enums.includes(item));
        const prismaItems = importedItems.filter(item => !enums.includes(item));

        if (localEnums.length > 0) {
            console.log(`Fixing ${filePath}`);

            // Calculate relative path to src/utils/prisma-enums
            const utilsDir = path.join(rootDir, 'utils');
            let relativePath = path.relative(path.dirname(filePath), utilsDir).replace(/\\/g, '/');
            if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
            const importPath = `${relativePath}/prisma-enums`;

            let newContent = content;

            // Remove the original import line
            newContent = newContent.replace(match[0], '');

            // Add new imports
            const newImports = [];
            if (prismaItems.length > 0) {
                newImports.push(`import { ${prismaItems.join(', ')} } from '@prisma/client';`);
            }
            if (localEnums.length > 0) {
                newImports.push(`import { ${localEnums.join(', ')} } from '${importPath}';`);
            }

            newContent = newImports.join('\n') + '\n' + newContent.trimStart();

            fs.writeFileSync(filePath, newContent);
        }
    }
}

walk(rootDir);
console.log('Done replacement');
