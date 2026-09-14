import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default ts.config(
 { ignores: ['dist/**','node_modules/**','public/runtime/**','test-results/**','playwright-report/**','docs/preview/**','docs/polish-originals/**'] },
 js.configs.recommended, ...ts.configs.recommended,
 { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: {...globals.browser, ...globals.worker} }, plugins: {'react-hooks':hooks}, rules: {'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]} },
 {files:['**/*.ts','**/*.tsx'],rules:{'no-undef':'off'}},
 {files:['tests/browser/**/*.{ts,tsx}'],languageOptions:{globals:globals.browser}},
 {files:['scripts/*.cjs'],rules:{'@typescript-eslint/no-require-imports':'off'}},
 {files:['*.js','*.ts','scripts/**/*.{js,mjs,cjs}','e2e/**/*.ts'],languageOptions:{globals:globals.node}}
);
