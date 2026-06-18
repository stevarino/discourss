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
const TOP_LEVEL_COMMENT = `/**
 * Given a spreadsheet with a set of letterboxd RSS feeds, read the
 * feed and ping discord with any updates.
 * 
 * To manually test, run the function onTimer()
 * 
 * Requires library Cheerio: 1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0
 * 
 * Spreadsheet requirements:
 * 
 * A sheet called "feeds" with the headers listed below (Feed, Time, Discord,
 * GUID, Status). Order does not matter and you can have other columns. The
 * actual rows for each feed can be equations.
 * 
 * A sheet called "settings" with each row being a setting (no header needed).
 * See the Settings typedef below for what can be set.
 * 
 * Set this script up to run with the following triggers:
 * 
 *  - From Spreadsheet - On Open: 
 *    - function: onOpen
 *  - Time Based:
 *    - function: onTimer
 *    - frequency: recommend "Every 5 Minutes", script will rate limit itself
 *      through settings such as feed_limit and feed_frequency.
 */

`;
async function build() {
    const bundle = await rollup({
        input: entryFile,
    });
    fs.mkdir(directory, { recursive: true });
    const output = [TOP_LEVEL_COMMENT];
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
