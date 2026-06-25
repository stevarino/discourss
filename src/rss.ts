/**
 * rss.js - functions related to processing RSS feeds.
 */

import { Result, STATUS, Message, SafeFeed, XmlDocument } from './common.js';
import { Context } from './context.js';
import { buildEmbed } from './discord.js';

/**
 * Process Feed
 */
export function processFeed(feed: SafeFeed, ctx: Context): Result {
  // skip feed that has recently been scanned
  const diff = ctx.now - feed.time;
  if (diff < ctx.feed_frequency.value * 1000) {
    ctx.info(`${feed.feed} - hit frequency limit of ${ctx.feed_frequency} seconds (${diff / 1000}s) - skipping`);
    return { status: STATUS.SKIP, status_text: '' };
  }

  ctx.info(`${feed.feed} - fetching`);
  const res = ctx.fetch(feed.feed, {muteHttpExceptions: true});
  if (!String(res.getResponseCode()).startsWith('2')) {
    return {
      status: STATUS.ERROR, 
      status_text: `HTTP Response code: ${res.getResponseCode()}`
    };
  }
  return parseRssXml(res.getContentText(), feed, ctx);
}


function parseRssXml(content: string, feed: SafeFeed, ctx: Context): Result {
  const msg: Message = {
    username: feed.discord,
    embeds: [],
  }

  const doc: XmlDocument = XmlService.parse(content.trim());
  const root = doc.getRootElement();
  if (!root) {
    throw Error('Failed to parse feed');
  }

  const channel = root.getChild('channel');
  if (!channel) {
    throw Error('channel element not found')
  }
  let firstGuid = '';
  let foundLast = false;
  let status = 'ok';
  const items = channel.getChildren("item");
  if (items.length === 0) {
    firstGuid = '0';
    status = 'no items';
  }
  for (const item of items) {
    const guid = item.getChild('guid')?.getText();
    if (!guid) {
      ctx.warn(`GUID not specified on feed item. Skipping.`)
      continue;
    }
    if (!firstGuid) {
      firstGuid = guid;
    }
    if (guid === feed.guid) {
      foundLast = true;
      break;
    }
    msg.embeds.push(buildEmbed(ctx, item));
  }

  // TODO: better separate this.
  // new (to us) feed. we only care about entries moving forward, not
  // entries we have already seen.
  if(!foundLast && String(feed.guid) !== '0') {
    status = 'new feed';
    msg.embeds.length = 0;
  } else {
    status = `found ${msg.embeds.length}`
  }
  return { 
    status: STATUS.OK,
    status_text: status,
    guid: firstGuid,
    message: msg,
  };
}
