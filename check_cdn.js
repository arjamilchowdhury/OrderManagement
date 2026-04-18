const https = require('https');
https.get('https://aistudiocdn.com/react@19.2.0/index.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("React string match:", /fetch\s*=/.test(data), /window\.fetch/.test(data));
  });
});
https.get('https://aistudiocdn.com/firebase@12.6.0/database.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("FB string match:", /fetch\s*=/.test(data), /window\.fetch/.test(data));
  });
});
