import { mkdir,copyFile } from 'node:fs/promises';
const files=['index.html','admin.html','style.css','app.js','admin.js','api.js','config.js','favicon.svg','engagement.js','engagement-api.js','moderation.js'];
await mkdir('dist',{recursive:true});
for(const file of files) await copyFile(file,`dist/${file}`);
console.log('Built portfolio into dist/');
