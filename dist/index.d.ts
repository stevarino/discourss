/**
 * index.js - main entry point for code
 */
import * as CheerioLib from 'cheerio';
declare global {
    const Cheerio: typeof CheerioLib;
}
export { setup } from './sheets.js';
import { Context } from './settings.js';
export declare function run(ctx?: Context): void;
export declare function onOpen(): void;
/**
 * Executes run when triggered by timer.
 */
export declare function timerTrigger(): void;
export declare function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput;
