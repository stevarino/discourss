/**
 * index.js - main entry point for code
 */

import * as CheerioLib from 'cheerio';
import {
  Result, SHEET_HEADERS, CELL_VALUE, SHEET_HEADER_TYPES, STATUS, Spreadsheet
} from './common.js';
import {
  LOG_LEVEL, LOG_RECORD, errorToString, log, Context
} from './context.js';
import { 
  readSettingsTab, readFeedsTab, updateFeedsTab, writeLogs, FEEDS_TAB, SETTINGS_TAB,
  TIMER_TRIGGER, setupFeedsTab, setupSettingsTab
} from './sheets.js';
import { processFeed } from './rss.js';
import { version } from './version.js';
import { sendDiscordMessage } from './discord.js';

declare global {
  const Cheerio: typeof CheerioLib;
}

export function run(ctx?: Context): void {
  const spreadsheet = SpreadsheetApp.getActive();
  const logs: LOG_RECORD[] = [];
  try {
    if (!ctx) {
      ctx = buildContext(spreadsheet, logs);
      if (!ctx) {
        throw new Error('Unable to load Settings.');
      }
    }
    ctx.info(`--- START (${version}) ---`);
    const [tab, feeds] = readFeedsTab(ctx);
    ctx.info(`Read ${feeds.length} rows`);

    let count = 0;
    for (const feed of feeds) {
      let result: Result;
      try {
        result = processFeed(feed, ctx);
      } catch (e) {
        // even if we fail we want to count it.
        count += 1;
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
        updateFeedsTab(tab, feed.index, h, v, ctx!.feedHeaders)
      }
      update(SHEET_HEADERS.time, ctx.now);
      if (result.guid) {
        update(SHEET_HEADERS.guid, result.guid);
      }
      update(SHEET_HEADERS.status, `${STATUS[result.status]}: ${result.status_text}`);
      ctx.info(`Updated row ${feed.index+1} ${STATUS[result.status]}: ${result?.status_text}`);

      count += 1;
      if (count >= ctx.feed_limit.value) {
        ctx.info(`hit limit of ${ctx.feed_limit.value} feeds - stopping`);
        break;
      }
    }
  } catch (e) {
    log(logs, errorToString(e), LOG_LEVEL.ERROR);
  } finally {
    writeLogs(spreadsheet, logs);
  }
}

function buildContext(sheet: Spreadsheet, logs: LOG_RECORD[]) {
  const ctx = new Context(sheet, logs);
  const [, data] = readSettingsTab(sheet);
  const errors = ctx.setSettings(data as [string, CELL_VALUE][]);
  if (errors.length) {
    const msg = `Errors occurred during startup: ${errors.join('; ')}`;
    log(logs, msg, LOG_LEVEL.ERROR);
    throw new Error('Unable to construct Context');
  }
  ctx.feedPatternRe = new RegExp(ctx.feed_pattern.value);
  return ctx;
}

export function onOpen(): void {
  buildMenu();
}

function hasSheet(name: string) {
  return Boolean(SpreadsheetApp.getActive().getSheetByName(name));
}

function buildMenu(): void {
  const menu = SpreadsheetApp.getUi().createMenu('DiscouRSS');
  const isReady = hasSheet(FEEDS_TAB) && hasSheet(SETTINGS_TAB);
  if (isReady) menu.addItem('Run', 'run');
  if (getTimeTrigger()) {
    menu.addItem('Disable', 'disableTriggers')
  } else {
    menu.addItem('Enable', 'setupTriggers')
  }
  menu.addItem('Setup', 'sheetsSetup');
  menu.addItem('About', 'about')
  menu.addToUi()
}

export function about(): void {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput().append(`
      <p>
        <a href='https://disourss.stevarino.com/'>DiscouRSS Homepage</a>
      </p>
      <p>
        Version: ${version}
      </p>
    `), 'About DiscouRSS'
  )
}

export function setupTriggers(): void {
  if (getTimeTrigger() === undefined) {
    ScriptApp.newTrigger('timerTrigger')
      .timeBased().everyMinutes(5).create();
  }
  buildMenu();
}

export function disableTriggers(): void {
  const trigger = getTimeTrigger();
  if (trigger) {
    ScriptApp.deleteTrigger(trigger);
  }
  buildMenu();
}

export function sheetsSetup(): void {
  const ctx = new Context(SpreadsheetApp.getActive());
  setupFeedsTab(ctx.spreadsheet);
  setupSettingsTab(ctx.spreadsheet, ctx.defaults);
  buildMenu();
}

export function getTimeTrigger(): GoogleAppsScript.Script.Trigger | null {
  for  (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === TIMER_TRIGGER) {
      return trigger;
    }
  }
  return null;
}

/**
 * Executes run when triggered by timer.
 */
export function timerTrigger(): void {
  run();
}

export function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  let params = JSON.stringify(e);
  return ContentService.createTextOutput(params).setMimeType(
    ContentService.MimeType.JSON);
}
