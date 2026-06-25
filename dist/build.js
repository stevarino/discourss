/**
 * cleanup.ts - cleans up the compiled js code to ensure it is valid gs code.
 *
 * There's probably a better way to do this but I couldn't figure it out. :-/
 */
import * as fs from 'node:fs/promises';
import path from 'path';
import { execSync } from 'node:child_process';
// markdown parsing
import { marked } from 'marked';
// rollup
import { rollup } from 'rollup';
import * as resolve from '@rollup/plugin-node-resolve';
import { version } from './version.js';
const entryFile = 'dist/index.js';
const directory = 'dist/clasp';
const bundleFile = directory + '/code.gs';
const URL = 'https://workspace.google.com/marketplace/app/discourss/107272671119';
// const PROD_DEPLOYMENT = 'AKfycbxtvC7at1Ru1wBUFUexXzP2Pn5SSHCyil7U_Cwrr8Jk_WEqjNwP-cTQSOw4rHQt_y2IJQ';
// const URL = `https://script.google.com/macros/s/${PROD_DEPLOYMENT}/exec`;
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
async function getHeadVersion() {
    var _a;
    const buf = execSync('npx clasp versions').toString();
    const matches = buf.matchAll(/^\d+/mg);
    console.log((_a = Array.from(matches).pop()) === null || _a === void 0 ? void 0 : _a[0]);
}
async function writeVersion() {
    const content = `export const version: string = '${new Date().getTime().toLocaleString('en-US').replace(/,/g, '-')}';\n`;
    await fs.writeFile('src/version.ts', content);
    await fs.writeFile('dist/version.js', content.replace(': string', ''));
}
async function printVersion() {
    const content = await fs.readFile('package.json', 'utf-8');
    const json = JSON.parse(content);
    console.log(`${json.version} (${version})`);
}
async function buildWeb() {
    const base_dir = './doc/md/';
    const output_dir = './doc/html/';
    await fs.copyFile('README.md', path.join(base_dir, 'index.md'));
    // empty the output directory
    for (let filename of await fs.readdir(output_dir)) {
        await fs.rm(path.join(output_dir, filename), { recursive: true, force: true });
    }
    let template = await fs.readFile(path.join(base_dir, 'template.html'), { encoding: 'utf-8' });
    const replacements = [
        [/__SCRIPT_URL__/g, URL],
    ];
    for (const [regex, value] of replacements) {
        template = template.replace(regex, value);
    }
    const files = await fs.readdir(base_dir, { recursive: true });
    for (const filename of files) {
        if (!filename.endsWith('.md')) {
            continue;
        }
        const markdown = await fs.readFile(path.join(base_dir, filename), { encoding: 'utf-8' });
        const html = template.replace('__CONTENT__', await marked(markdown));
        const output_filename = path.join(output_dir, filename).replace(/\.md$/, '.html');
        await fs.mkdir(path.dirname(output_filename), { recursive: true });
        await fs.writeFile(output_filename, html);
        console.log(`Wrote ${output_filename}`);
    }
}
async function build() {
    await writeVersion();
    await buildWeb();
    const bundle = await rollup({
        input: entryFile,
        plugins: [resolve.nodeResolve()]
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
async function run() {
    if (process.argv.includes('--version')) {
        printVersion();
    }
    else if (process.argv.includes('--head')) {
        getHeadVersion();
    }
    else if (process.argv.includes('--web')) {
        buildWeb();
    }
    else if (process.argv.includes('--build')) {
        build();
    }
    else {
        console.error('Unrecognized command');
        process.exit(1);
    }
}
run().catch(console.error);
