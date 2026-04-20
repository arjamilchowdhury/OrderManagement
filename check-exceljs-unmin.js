import https from 'https';

https.get('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        let regex = /.{0,40}fetch.{0,40}/g;
        let m;
        let c = 0;
        const matches = [];
        while ((m = regex.exec(data)) !== null) {
            matches.push(m[0]);
            c++;
            if (c > 20) break;
        }
        console.log("Matches:", matches);
    });
});
