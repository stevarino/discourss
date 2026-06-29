/**
 * index.js - main entry point for code
 */
import * as CheerioLib from 'cheerio';
import { CELL_VALUE, SidebarData } from './common.js';
import { Context } from './context.js';
declare global {
    const Cheerio: typeof CheerioLib;
}
/** Ran when opened. Permissions are in an indeterminate state here. */
export declare function onOpen(): void;
/** User clicks "setup" on sidebar. Sets up initial table. */
export declare function setup(worksheet: string): void;
/** Ran when user clicks "Run" in the sidebar. */
export declare function run(ctx?: Context): void;
/** User submits settings from sidebar. Returns errors. */
export declare function setSettings(sheet: string, data: [string, CELL_VALUE][]): string[];
/** Show the sidebar, duh. :P */
export declare function showSidebar(): void;
/** Sidebar has requested data. */
export declare function getSidebarData(): SidebarData;
/** Enable or Disable the timer. */
export declare function toggleTimer(): boolean | null;
/** Timer execution. */
export declare function timerTrigger(): void;
export declare function alert(msg: string): void;
export declare function deleteSettings(sheet: string): void;
export declare function pollCurrentSheet(): string;
/** HTTP endpoint. Currently unsued. */
export declare function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput;
