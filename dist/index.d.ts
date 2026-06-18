/**
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
import * as CheerioLib from 'cheerio';
import { Settings } from './common.js';
declare global {
    const Cheerio: typeof CheerioLib;
}
export * from './setup.js';
export declare function run(settings?: Settings): void;
export declare function onOpen(): void;
export declare function timerTrigger(): void;
export declare function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput;
