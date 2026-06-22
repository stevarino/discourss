/**
 * index.js - main entry point for code
 */

import * as CheerioLib from 'cheerio';
import {
  Result, Message, SafeFeed, SHEET_HEADERS, CELL_VALUE, SHEET_HEADER_TYPES, 
  Embed, STATUS, Spreadsheet
} from './common.js';
import {
  LOG_LEVEL, LOG_RECORD, errorToString, log, Context
} from './context.js';
import { 
  readSettingsTab, readFeedsTab, updateFeedsTab, writeLogs
} from './sheets.js';
import { FetchRequest } from './fetch.js';
import { processFeed } from './rss.js';
import { version } from './version.js';

export {setup} from './sheets.js';

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

/**
 * Send a message through discord using the webhook.
 */
function sendDiscordMessage(embeds: Embed[], feed: SafeFeed, ctx: Context) {
  if (!ctx.webhook.value) {
    return;
  }
  const message: Message = {
    embeds,
    username: ctx.appname.value,
    content: String(feed.discord ?? ''),
    avatar_url: (v => v ? v : undefined)(ctx.avatar_url.value),
  };

  // evaluate message contents
  if (/^[0-9]+$/.test(message.content!)) {
    message.allowed_mentions = {users: [message.content!]};
    message.content = `<@${message.content!}>`;
  }
  const signature = ctx.signature.value;
  if (signature && signature.includes('%s')) {
    message.content = signature.replace('%s', message.content!);
  }

  const requests: FetchRequest[] = [];
  if (ctx.bundle.value) {
    requests.push({
      method: 'post',
      payload: JSON.stringify(message),
      muteHttpExceptions: true,
      contentType: "application/json"
    } as const);
  } else {
    for (const embed of message.embeds) {
      let payload = {...message}
      payload.embeds = [embed]
      requests.push({
        method: 'post',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        contentType: "application/json"
      } as const)
    }
  }

  for (let i=0; i<requests.length; i++) {
    const response = ctx.fetch(ctx.webhook.value, requests[i]);
    if (response.getResponseCode() != 204) {
      throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
    }
  }
}

export function onOpen(): void {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp, SlidesApp or FormApp.
  ui.createMenu('RSS Updater')
      .addItem('Run', 'run')
      .addItem('Setup', 'setup')
      .addToUi();
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
