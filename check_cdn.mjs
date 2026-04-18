import https from 'https';

https.get('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("SheetJS string match:", /fetch\s*=/.test(data));
    const lines = data.split('\n');
    for(let i=0; i<lines.length; i++){
      if(lines[i].includes('fetch')){
         const idx = lines[i].indexOf('fetch');
         console.log('Match context:', lines[i].slice(Math.max(0, idx-20), idx+20));
      }
    }
  });
});
