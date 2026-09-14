import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const gates=JSON.parse(await readFile(resolve(root,'RELEASE_GATES.json'),'utf8'));
const failures=[];
for(const [name,gate] of Object.entries(gates.checks))if(gate.passed!==true||!gate.evidence?.trim())failures.push(`${name}: ${gate.evidence||'no verification evidence recorded'}`);
try{await access(resolve(root,'package-lock.json'));}catch{failures.push('A reviewed, committed package-lock.json is required.');}
if(!gates.releaseCommit||gates.releaseCommit.length<7)failures.push('Record the exact release commit.');
if(failures.length){console.error('RELEASE BLOCKED\n\n'+failures.map(s=>' - '+s).join('\n'));process.exitCode=1;}
else console.log(`Release evidence recorded for ${gates.releaseCommit}. Evidence must still be reviewed by the maintainer.`);
