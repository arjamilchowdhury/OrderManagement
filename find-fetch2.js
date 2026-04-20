import fs from 'fs';
import path from 'path';

function findFetch(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fullPath.includes('extractor') && fullPath.endsWith('.js')) {
            const text = fs.readFileSync(fullPath, 'utf8');
            if (text.match(/fetch\s*=/)) {
                console.log(fullPath);
            }
        }
    }
}
findFetch('/app/applet/public');
