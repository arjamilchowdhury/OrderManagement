import fs from 'fs';
import path from 'path';

function findFetch(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findFetch(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts')) {
            const text = fs.readFileSync(fullPath, 'utf8');
            if (text.includes("fetch =") || text.includes("fetch=")) {
                console.log(fullPath);
            }
        }
    }
}
findFetch('/app/applet/node_modules/xlsx');
