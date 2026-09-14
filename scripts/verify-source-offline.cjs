/** Limited source verification when dependency installation is unavailable.
 * This does NOT replace `npm run typecheck`, lint, Vitest, or a Vite build.
 * It checks fourteen dependency-free processing roots and parses TS/TSX syntax.
 */
const fs = require('node:fs');
const path = require('node:path');
let ts;
try { ts = require('typescript'); }
catch {
  try { ts = require(process.env.TYPESCRIPT_PATH || path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript')); }
  catch { throw new Error('Install TypeScript or set TYPESCRIPT_PATH to its package directory.'); }
}
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs/evidence');
fs.mkdirSync(evidence, { recursive: true });
const roots = [
  'features/edit-map/index.ts', 'features/silence/index.ts', 'features/captions/index.ts',
  'features/framing/index.ts', 'features/audio-enhance/dsp.ts', 'features/renderer/index.ts',
  'features/exporter/paged-target.ts', 'workers/network-guard.ts', 'features/media/audio-timeline.ts',
  'lib/errors.ts', 'lib/jobs.ts', 'features/transcription/model.ts', 'app/result-guards.ts',
  'features/exporter/integrity.ts',
];
const options = {
  noEmit: true, strict: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [],
};
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(roots.map(f => path.join(root, 'src', f)), options));
const present = d => ({
  file: d.file ? path.relative(root, d.file.fileName) : undefined,
  line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : undefined,
  code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
});
const stamp = new Date().toISOString();
fs.writeFileSync(path.join(evidence, 'core-typecheck.json'), JSON.stringify({
  observedAt: stamp, compiler: ts.version, scope: roots, diagnostics: diagnostics.map(present),
  thirdPartyModulesChecked: false, fullProjectTypecheck: false,
}, null, 2) + '\n');
const files = [];
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) collect(file);
    else if (/\.tsx?$/.test(e.name)) files.push(file);
  }
}
for (const name of ['src', 'tests', 'e2e', 'production-e2e', 'model-e2e']) collect(path.join(root, name));
for (const name of fs.readdirSync(root)) if (/\.tsx?$/.test(name)) files.push(path.join(root, name));
const syntax = files.flatMap(file => {
  const text = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return parsed.parseDiagnostics.map(present);
});
fs.writeFileSync(path.join(evidence, 'source-syntax.json'), JSON.stringify({
  observedAt: stamp, compiler: ts.version, files: files.length,
  scope: files.map(f => path.relative(root, f)).sort(), diagnostics: syntax,
  dependenciesResolved: false, syntaxOnly: true,
}, null, 2) + '\n');
console.log(`${roots.length} dependency-free roots checked: ${diagnostics.length} diagnostics.`);
console.log(`${files.length} TS/TSX files parsed: ${syntax.length} syntax diagnostics.`);
console.log('This is limited source verification, not a production dependency build.');
for (const d of [...diagnostics.map(present), ...syntax]) console.error(d);
process.exitCode = diagnostics.length || syntax.length ? 1 : 0;
