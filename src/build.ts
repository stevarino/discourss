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
import { rollup, OutputChunk } from 'rollup';
import * as resolve from '@rollup/plugin-node-resolve';

import {version} from './version.js';

const entryFile = 'dist/index.js';
const claspDir = 'dist/clasp';
const bundleFile = claspDir + '/code.gs';

const URL = 'https://workspace.google.com/marketplace/app/discourss/107272671119';
// const PROD_DEPLOYMENT = 'AKfycbxtvC7at1Ru1wBUFUexXzP2Pn5SSHCyil7U_Cwrr8Jk_WEqjNwP-cTQSOw4rHQt_y2IJQ';
// const URL = `https://script.google.com/macros/s/${PROD_DEPLOYMENT}/exec`;

const toCopy = [
  'data/appsscript.json',
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
  const buf = execSync('npx clasp versions').toString();
  const matches = buf.matchAll(/^\d+/mg)
  console.log(Array.from(matches).pop()?.[0]);
}

async function writeVersion() {
  const content = `export const version: string = '${
    new Date().getTime().toLocaleString('en-US').replace(/,/g, '-')
  }';\n`;
  await fs.writeFile('src/version.ts', content);
  await fs.writeFile('dist/version.js', content.replace(': string', ''));
}

async function printVersion() {
  const content = await fs.readFile('package.json', 'utf-8');
  const json = JSON.parse(content);
  console.log(`${json.version} (${version})`);
}

async function buildWeb() {
  const baseDir = './doc/md/';
  const outputDir = './doc/html/';

  await fs.copyFile('README.md', path.join(baseDir, 'index.md'));

  // empty the output directory
  for (let filename of await fs.readdir(outputDir)) {
    await fs.rm(path.join(outputDir, filename), {recursive: true, force: true});
  }

  let template = await fs.readFile(
    path.join(baseDir, 'template.html'), {encoding: 'utf-8'});
  const replacements: [RegExp, string][] = [
    [/__SCRIPT_URL__/g, URL],
  ]
  for (const [regex, value] of replacements) {
    template = template.replace(regex, value);
  }
  const files = await fs.readdir(baseDir, {recursive: true});
  for (const filename of files) {
    const filePath = path.join(baseDir, filename);
    const outputPath = path.join(outputDir, filename);
    if ((await fs.stat(filePath)).isDirectory() || filename.endsWith('.html')) {
      continue;
    }
  
    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    if (filename.endsWith('.md')) {
      const markdown = await fs.readFile(filePath, {encoding: 'utf-8'});
      const html = template.replace('__CONTENT__', await marked(markdown));
      await fs.writeFile(outputPath.replace(/\.md$/, '.html'), html);
      console.log(`Built ${filename}`);
    } else {
      fs.copyFile(filePath, outputPath);
      console.log(`Copied ${filename}`);
    }
  }
}

function cleanCode(code: string) {
  for (const regex of toRemove) {
    while (regex.test(code)) {
      code = code.replace(regex, '');
    }
  }
  return code;
}

async function buildSidebar() {
  const target = '__SIDEBAR_SCRIPT__';
  const js = (await rollupJs('dist/sidebar.js')).join('\n');
  let html = await fs.readFile('data/sidebar.html', 'utf-8');
  html = cleanCode(html.replace(target, js));
  await fs.writeFile('dist/clasp/sidebar.html', html);
}

async function rollupJs(filename: string): Promise<string[]> {
  const bundle = await rollup({
    input: filename,
    plugins: [resolve.nodeResolve()]
  });
  const output: string[] = [];
  const chunks = await bundle.generate({format: 'esm'})
  for (const chunk of chunks.output) {
      let code = (chunk as OutputChunk).code;
      if (code !== undefined) {
        output.push(cleanCode(code));
      }
  }
  return output;
}

async function build() {
  await fs.mkdir('dest/clasp', {recursive: true});
  await writeVersion();
  await buildWeb();
  await buildSidebar();
  const output = await rollupJs(entryFile);

  fs.mkdir(claspDir, {recursive: true});
  await fs.writeFile(bundleFile, [TOP_LEVEL_COMMENT, ...output].join('\n'));

  for (const filename of toCopy) {
    const fn = path.basename(filename);
    await fs.copyFile(filename, path.join(claspDir, fn));
  }

  console.log(`Rolled up ${entryFile} into ${bundleFile}`);
}

async function run() {
  if (process.argv.includes('--version')) {
    printVersion();
  } else if (process.argv.includes('--head')) {
    getHeadVersion();
  } else if (process.argv.includes('--web')) {
    buildWeb();
  } else if (process.argv.includes('--build')) {
    build();
  } else {
    console.error('Unrecognized command');
    process.exit(1)
  }
}

run().catch(console.error);