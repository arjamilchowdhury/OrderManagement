import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('papaparse fetch:', data.indexOf('fetch')));
});
