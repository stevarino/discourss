/**
 * index.js - main entry point for code
 */

import * as CheerioLib from 'cheerio';
import {
  Result, Message,
  SafeFeed, LOG_LEVEL, LOG_RECORD,
  errorToString, log, SHEET_HEADERS,
  CELL_VALUE, SHEET_HEADER_TYPES, Embed,
  STATUS
} from './common.js';

declare global {
  const Cheerio: typeof CheerioLib;
}

export {setup} from './sheets.js';
import {defaults as sheetsDefaults, readFeedsTab, updateFeedsTab, writeLogs} from './sheets.js'
import {Context, getContext} from './settings.js'
import { processFeed } from './rss.js';

sheetsDefaults.settings = Context.getDefaults();

export function run(ctx?: Context): void {
  const spreadsheet = SpreadsheetApp.getActive();
  const logs: LOG_RECORD[] = [];
  try {
    if (!ctx) {
      ctx = getContext(spreadsheet, logs);
      if (!ctx) {
        throw new Error('Unable to load Settings.');
      }
    }
    const [tab, feeds] = readFeedsTab(ctx);

    let count = 0;
    for (const feed of feeds) {
      count += 1;
      if (count > ctx.feed_limit.value) {
        ctx.info(`hit limit of ${ctx.feed_limit} feeds - stopping`);
        break;
      }

      let result: Result;
      try {
        result = processFeed(feed, ctx);
      } catch (e) {
        ctx.warn(errorToString(e));
        continue
      }
      if (result.status === STATUS.SKIP) {
        count -= 1;
        continue;
      }

      if (result?.message?.embeds?.length) {
        sendDiscordMessage(result.message.embeds, feed, ctx)
      }
      // update feed state in spreadsheet
      if (result?.guid) {
        const update = (h: SHEET_HEADER_TYPES, v: CELL_VALUE) => {
          updateFeedsTab(tab, feed.index, h, v, ctx!.feedHeaders)
        }
        update(SHEET_HEADERS.time, ctx.now);
        update(SHEET_HEADERS.guid, result.guid);
        update(SHEET_HEADERS.status, `${result.status}: ${result.status_text}`);
      }
      ctx.info(`Updated row ${feed.index} ${result?.status}: ${result?.status_text}`);
    }
  } catch (e) {
    log(logs, errorToString(e), LOG_LEVEL.ERROR);
  } finally {
    writeLogs(spreadsheet, logs);
  }
}
  
interface Request {
  method: 'get'|'post',
  payload: string,
  muteHttpExceptions: true,
  contentType: string,
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

  const requests: Request[] = [];
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
    const response = UrlFetchApp.fetch(ctx.webhook.value, requests[i]);
    if (response.getResponseCode() != 200) {
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
