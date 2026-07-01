/**
 * index.js - main entry point for code
 */
import * as CheerioLib from 'cheerio';
import { SidebarData, SidebarSaveRequest, SidebarSaveResponse, ButtonSet, Button, SidebarPollResponse } from './common.js';
import { Context } from './context.js';
declare global {
    const Cheerio: typeof CheerioLib;
}
/** Ran when opened. Permissions are in an indeterminate state here. */
export declare function onOpen(): void;
/** Ran when user clicks "Run" in the sidebar. */
export declare function run(ctx?: Context): void;
/** User submits settings from sidebar. Returns errors. */
export declare function setSettings(req: SidebarSaveRequest): SidebarSaveResponse | null;
/** Show the sidebar, duh. :P */
export declare function showSidebar(): void;
/** Sidebar has requested data. */
export declare function getSidebarData(): SidebarData;
/** Enable or Disable the timer. */
export declare function toggleTimer(): boolean | null;
/** Timer execution. */
export declare function discourssTimerTrigger(): void;
export declare function alert(msg: string, buttonset?: ButtonSet): Button;
export declare function deleteSettings(sheetId: string): SidebarSaveResponse | null;
export declare function pollCurrentSheet(): SidebarPollResponse;
/** HTTP endpoint. Currently unsued. */
export declare function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput;
