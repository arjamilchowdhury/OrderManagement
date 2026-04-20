import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        let regex = /.{0,30}fetch.{0,30}/g;
        let m;
        let c = 0;
        while ((m = regex.exec(data)) !== null) {
            console.log(m[0]);
            c++;
            if (c > 20) break;
        }
    });
});
