import { createRequire } from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';
import { readFile, readdir, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..'), require=createRequire(join(root,'package.json'));
async function packageRoot(name, resolver=require) {
 let dir=dirname(resolver.resolve(name));
 for (;;) {
  try {const p=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));if(p.name===name)return {dir,p};}catch{/* Optional notice or package metadata is absent. */}
  const parent=dirname(dir);if(parent===dir)throw new Error(`Cannot locate installed package ${name}`);dir=parent;
 }
}
const manifest={generatedAt:new Date().toISOString(),assets:[],packages:[]};
async function copyRuntime(pkg,folder,destination,pattern,transform) {
 const target=join(root,'public/runtime',destination);await mkdir(target,{recursive:true});
 const names=(await readdir(join(pkg.dir,folder))).filter(n=>pattern.test(n));
 if(!names.some(n=>n.endsWith('.wasm')))throw new Error(`No WASM runtime found in ${pkg.p.name}/${folder}`);
 for(const name of names) {const source=join(pkg.dir,folder,name),dest=join(target,name);const sourceBytes=await readFile(source),bytes=transform?await transform(sourceBytes,name):sourceBytes;await writeFile(dest,bytes);manifest.assets.push({path:relative(join(root,'public'),dest).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),package:pkg.p.name,version:pkg.p.version});}
}
await rm(join(root,'public/runtime'),{recursive:true,force:true});
const transformers=await packageRoot('@huggingface/transformers');
const ort=await packageRoot('onnxruntime-web',createRequire(join(transformers.dir,'package.json')));
const vision=await packageRoot('@mediapipe/tasks-vision');
await copyRuntime(ort,'dist','ort',/^ort-wasm.*\.(wasm|mjs)$/);
const prepareVisionLoader=async (sourceBytes,name) => {
 if (!name.endsWith('.js')) return sourceBytes;
 const source=sourceBytes.toString('utf8');
 // The classic UMD loaders only export ModuleFactory for CommonJS/AMD. MediaPipe
 // loads these files with importScripts() inside a module worker, so expose the
 // factory explicitly without changing the SDK bundle or its network behavior.
 if (!/\bModuleFactory\b/.test(source)) return sourceBytes;
 const bridge=[];
 if (!/globalThis\.ModuleFactory\s*=\s*ModuleFactory/.test(source)) bridge.push('globalThis.ModuleFactory = ModuleFactory;');
 // The classic Emscripten loaders declare this fallback inside a block, then
 // call it later from the factory. Keep the same global shim as the module loader.
 if (!/globalThis\.custom_dbg\s*=/.test(source)) bridge.push('globalThis.custom_dbg = console.warn.bind(console);');
 return bridge.length ? Buffer.from(`${source}\n;${bridge.join(' ')}\n`, 'utf8') : sourceBytes;
};
await copyRuntime(vision,'wasm','vision',/^vision_[\w.-]+\.(wasm|js|mjs)$/,prepareVisionLoader);
// Preserve installed license notices, including transitive dependencies. Never copy font binaries here.
const noticeDir=join(root,'public/notices');await rm(noticeDir,{recursive:true,force:true});await mkdir(noticeDir,{recursive:true});
const seen=new Set();
async function inspectModules(folder) {
 let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch{return;}
 for(const entry of entries) {
  if(entry.name.startsWith('.'))continue;
  const dir=join(folder,entry.name);
  if(entry.name.startsWith('@')){await inspectModules(dir);continue;}
  if(!entry.isDirectory())continue;
  let p;try{p=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));}catch{continue;}
  const id=`${p.name}@${p.version}`;
  if(!seen.has(id)) {
   seen.add(id);const notices=[];
   for(const name of await readdir(dir))if(/^(licen[cs]e|copying|notice|authors)([._-]|$)/i.test(name)) {
    try{const text=await readFile(join(dir,name),'utf8'),file=`${id.replaceAll('/','__')}-${name}`;await writeFile(join(noticeDir,file),text);notices.push(file);}catch{/* Optional notice or package metadata is absent. */}
   }
   manifest.packages.push({name:p.name,version:p.version,license:p.license??'REVIEW REQUIRED',repository:p.repository??null,notices});
  }
  await inspectModules(join(dir,'node_modules'));
 }
}
await inspectModules(join(root,'node_modules'));
await writeFile(join(root,'public/runtime/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await copyFile(join(root,'THIRD_PARTY_NOTICES.md'),join(noticeDir,'THIRD_PARTY_NOTICES.md'));
await writeFile(join(root,'public/.nojekyll'),'');
console.log(`Prepared ${manifest.assets.length} same-origin runtime files and ${manifest.packages.length} package notices.`);
