import https from 'https';
import fs from 'fs';

https.get('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        // Find self.fetch = ... or window.fetch = ... and replace it safely
        const patched = data.replace(/self\.fetch\s*=/g, 'self._fetch =').replace(/window\.fetch\s*=/g, 'window._fetch =');
        fs.writeFileSync('public/exceljs.patched.js', patched);
        console.log('Patched exceljs saved');
    });
});
