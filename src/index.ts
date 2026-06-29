/**
 * index.js - main entry point for code
 */

import * as CheerioLib from 'cheerio';
import {
  Result, SHEET_HEADERS, CELL_VALUE, SHEET_HEADER_TYPES, STATUS, 
  DEFAULT_APP_NAME, SidebarData
} from './common.js';
import {
  LOG_LEVEL, LOG_RECORD, errorToString, log, Context
} from './context.js';
import { 
  readFeedsTab, updateFeedsTab, writeLogs, setupFeedsTab,
} from './sheets.js';
import { processFeed } from './rss.js';
import { version } from './version.js';
import { sendDiscordMessage } from './discord.js';

declare global {
  const Cheerio: typeof CheerioLib;
}

const TIMER_TRIGGER = DEFAULT_APP_NAME + 'Timer';


/** A common execution wrapper. Handles context and logging. */
function wrapper<T>(
    method: string, ctx: Context|undefined,
    func: (ctx: Context) => T
): T | null {
  const spreadsheet = SpreadsheetApp.getActive();
  const logs: LOG_RECORD[] = [];
  try {
    if (!ctx) {
      ctx = new Context(spreadsheet, logs);
    }
    ctx.info(`--- START ${method} (${version}) ---`);
    return func(ctx);
  } catch (e) {
    log(logs, errorToString(e), LOG_LEVEL.ERROR);
  } finally {
    if (logs.length > 1) {
      writeLogs(spreadsheet, logs);
    }
  }
  return null;
}

/** Scan the Feeds table, read RSS feeds, and write to Discord. */
function execute(ctx: Context) {
  const feeds = readFeedsTab(ctx);
  ctx.info(`Read ${feeds.length} rows`);

  for (const feed of feeds) {
    const sheet = feed.settings.worksheet!;
    if (feed.settings.feedCount <= 0) {
      continue;
    }
    let result: Result;
    try {
      result = processFeed(feed, ctx);
    } catch (e) {
      // even if we fail we want to count it.
      ctx.warn(errorToString(e));
      continue
    }
    if (result.status === STATUS.SKIP) {
      continue;
    }

    if (result?.message?.embeds?.length) {
      sendDiscordMessage(result.message.embeds, feed, ctx)
    }
    // update feed state in spreadsheet
    const update = (h: SHEET_HEADER_TYPES, v: CELL_VALUE) => {
      updateFeedsTab(
        sheet, feed.index, h, v, feed.settings.feedHeaders)
    }
    update(SHEET_HEADERS.time, ctx.now);
    if (result.guid) {
      update(SHEET_HEADERS.guid, result.guid);
    }
    update(SHEET_HEADERS.status, `${STATUS[result.status]}: ${result.status_text}`);
    ctx.info(`Updated row ${sheet.getName()}:${feed.index+1} ${STATUS[result.status]}: ${result?.status_text}`);

    feed.settings.feedCount -= 1;
    if (feed.settings.feedCount === 0) {
      const limit = feed.settings.feed_limit.value;
      ctx.info(`[${sheet.getName()}]: Hit limit of ${limit} feeds`);
    }
  }
}

/** Ran when opened. Permissions are in an indeterminate state here. */
export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Show sidebar', 'showSidebar')
    .addToUi();
}

/** User clicks "setup" on sidebar. Sets up initial table. */
export function setup(worksheet: string): void {
  wrapper('setup', undefined, (ctx) => {
    const sheet = ctx.spreadsheet.getSheetByName(worksheet);
    if (sheet) {
      setupFeedsTab(sheet);
    }
  });
}

/** Ran when user clicks "Run" in the sidebar. */
export function run(ctx?: Context): void {
  wrapper('run', ctx, (ctx) => {
    execute(ctx);
  });
}

/** User submits settings from sidebar. Returns errors. */
export function setSettings(sheet: string, data: [string, CELL_VALUE][]): string[] {
  return wrapper('setSettings', undefined,(ctx) => {
    const errors = ctx.setSettings(sheet, data);
    if (errors?.length) {
      alert(`Errors occurred during saving:\n\n • ${errors.join('\n • ')}`);
    } else {
      ctx.info('Settings updated');
    }
    return errors;
  }) ?? [];
}

/** Show the sidebar, duh. :P */
export function showSidebar(): void {
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutputFromFile('sidebar').setTitle(DEFAULT_APP_NAME)
  );
}

/** Sidebar has requested data. */
export function getSidebarData(): SidebarData {
  return wrapper('getSidebarData', undefined, (ctx) => {
    return {
      active: SpreadsheetApp.getActive().getActiveSheet().getName(),
      version,
      timer: Boolean(getTimer()),
      sheets: ctx.getSettings(),
    } as SidebarData;
  })!;
}

/** Finds the timer trigger. */
function getTimer() {
  for  (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === TIMER_TRIGGER) {
      return trigger;
    }
  }
  return undefined;
}

/** Enable or Disable the timer. */
export function toggleTimer(): boolean|null {
  return wrapper('toggleTimer', undefined, () => {
    const timer = getTimer();
    if (timer) {
      ScriptApp.deleteTrigger(timer);
      return false;
    }
    ScriptApp.newTrigger(TIMER_TRIGGER).timeBased().everyHours(1).create();
    return true;
  });
}

/** Timer execution. */
export function timerTrigger(): void {
  wrapper('timer', undefined, ctx => {
    execute(ctx);
  });
}

export function alert(msg: string): void {
  const ui = SpreadsheetApp.getUi();
  ui.alert(msg);
}

export function deleteSettings(sheet: string): void {
  wrapper('deleteSettings', undefined, ctx => {
    ctx.deleteSettings(sheet);
    ctx.info('Settings deleted.');
  })
}

export function pollCurrentSheet(): string {
  return SpreadsheetApp.getActive().getActiveSheet().getName();
}

/** HTTP endpoint. Currently unsued. */
export function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  let params = JSON.stringify(e);
  return ContentService.createTextOutput(params).setMimeType(
    ContentService.MimeType.JSON);
}
