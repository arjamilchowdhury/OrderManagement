import fs from 'fs';
const text = fs.readFileSync('public/exceljs.patched.js', 'utf8');
const matches = [...text.matchAll(/.{0,30}fetch.{0,30}/gi)];
matches.forEach(m => console.log(m[0]));
