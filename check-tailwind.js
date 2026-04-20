import https from 'https';
https.get('https://cdn.tailwindcss.com', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('tailwind fetch:', data.indexOf('.fetch='), data.indexOf('window.fetch =')));
});
