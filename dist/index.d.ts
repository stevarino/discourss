/**
 * index.js - main entry point for code
 */
import * as CheerioLib from 'cheerio';
import { Context } from './context.js';
declare global {
    const Cheerio: typeof CheerioLib;
}
export declare function run(ctx?: Context): void;
export declare function onOpen(): void;
export declare function about(): void;
export declare function setupTriggers(): void;
export declare function disableTriggers(): void;
export declare function sheetsSetup(): void;
export declare function getTimeTrigger(): GoogleAppsScript.Script.Trigger | null;
/**
 * Executes run when triggered by timer.
 */
export declare function timerTrigger(): void;
export declare function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput;
