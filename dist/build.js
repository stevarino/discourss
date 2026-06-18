/**
 * cleanup.ts - cleans up the compiled js code to ensure it is valid gs code.
 *
 * There's probably a better way to do this but I couldn't figure it out. :-/
 */
import * as fs from 'node:fs/promises';
import { rollup } from 'rollup';
import path from 'path';
const entryFile = 'dist/index.js';
const directory = 'dist/clasp';
const bundleFile = directory + '/code.gs';
const toCopy = [
    'data/appsscript.json'
];
const toRemove = [
    /^export \{[^}]+\};?/mg,
    /^export /mg,
];
async function build() {
    const bundle = await rollup({
        input: entryFile,
    });
    fs.mkdir(directory, { recursive: true });
    const output = [];
    const chunks = await bundle.generate({ format: 'esm' });
    for (const chunk of chunks.output) {
        let code = chunk.code;
        if (code !== undefined) {
            for (const regex of toRemove) {
                while (regex.test(code)) {
                    code = code.replace(regex, '');
                }
            }
            output.push(code);
        }
    }
    await fs.writeFile(bundleFile, output.join('\n'));
    for (const filename of toCopy) {
        const fn = path.basename(filename);
        await fs.copyFile(filename, path.join(directory, fn));
    }
    console.log(`Rolled up ${entryFile} into ${bundleFile}`);
}
build().catch(console.error);
