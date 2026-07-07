/**
 * rss.js - functions related to processing RSS feeds.
 * 
 * TODO(#6): Inspect to transparently handle both RSS and Atom feeds.
 */

import { Result, STATUS, Feed, XmlDocument, Embed, SettingsInterface, renderLogHeader } from './common.js';
import { Context } from './context.js';
import { nodeToMarkdown } from './markdown.js';

export interface XMLFeed {
  title?: string,
  link?: string,
  items: XMLFeedItem[],
}

export interface XMLFeedItem {
  title: string,
  link: string,
  guid: string,
  pubDate: Date,
  description: string,
};

/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
export function processFeed(feed: Feed, ctx: Context): Result {
  // skip feed that has recently been scanned
  const diff = ctx.now - feed.time;
  if (diff < feed.settings.feed_frequency.value) {
    ctx.info(`${renderLogHeader(feed)} - hit frequency limit of ${feed.settings.feed_frequency} seconds (${diff / 1000}s) - skipping`);
    return { status: STATUS.SKIP, status_text: '' };
  }

  ctx.info(`${renderLogHeader(feed)} - fetching`);
  const res = ctx.fetch(feed.feed);
  if (!String(res.getResponseCode()).startsWith('2')) {
    return {
      status: STATUS.ERROR, 
      status_text: `HTTP Response code: ${res.getResponseCode()}`
    };
  }
  const text = res.getContentText();
  ctx.debug(`Received ${text.length} bytes`);
  return parseFeed(text, feed, ctx);
}


function parseFeed(content: string, feed: Feed, ctx: Context): Result {
  const embeds: Embed[] = [];
  const prevGuid = feed.guid ?? '';

  const xmlFeed = parseXML(content);

  let foundLast = false;
  for (const item of xmlFeed.items) {
    if (item.guid === feed.guid) {
      foundLast = true;
      break;
    }
    try {
      embeds.push(buildEmbed(ctx, feed.settings, item));
    } catch (e) {
      ctx.warn(`${renderLogHeader(feed)} "${item.guid}": Could not process embed: "${e}"`)
    }
  }

  // TODO: better separate this.
  // new (to us) feed. we only care about entries moving forward, not
  // entries we have already seen.
  if(!foundLast && prevGuid !== '0') {
    embeds.length = 0;
  }

  // oldest first
  embeds.reverse();
  const status = `Processed ${embeds.length}`;
  ctx.debug(`${renderLogHeader(feed)} ${status}`);
  const result = { 
    status: STATUS.OK,
    status_text: status,
    guid: xmlFeed.items[0]?.guid ?? '0',
    embeds: embeds,
  };
  feed.result = result;
  return result;
}

/** Parses XML Content and returns a normalized XMLFeed. */
export function parseXML(content: string): XMLFeed {
  const doc: XmlDocument = XmlService.parse(content);
  const root = doc.getRootElement();
  if (!root) {
    throw Error('Failed to parse feed.');
  }
  const channel = root.getChild('channel');
  if (!channel) {
    throw Error('Channel element not found.')
  }

  const xmlFeed: XMLFeed = {
    title: channel.getChild('title')?.getValue(),
    link: channel.getChild('link')?.getValue(),
    items: [],
  };
  
  for (const item of channel.getChildren("item")) {
    const missing = ['title', 'link', 'guid', 'pubDate', 'description'].filter(
      field => !Boolean(item.getChild(field)));
    if (missing.length) {
      console.debug(`Missing items: [${missing.join(', ')}], skipping.`);
      continue;
    }
    xmlFeed.items.push({
      title: item.getChild('title')!.getText(),
      link: item.getChild('link')!.getText(),
      guid: item.getChild('guid')!.getText(),
      pubDate: new Date(item.getChild('pubDate')!.getText()),
      description: item.getChild('description')!.getValue()
    })
  }
  return xmlFeed;
}

export function buildEmbed(ctx: Context, settings: SettingsInterface, item: XMLFeedItem): Embed {
  const html = Cheerio.load(item.description);
  const embed: Embed = {
    title: item.title,
    url: item.link,
    description: nodeToMarkdown(html),
    fields: [],
  }

  try {
    const epoch = Math.floor(item.pubDate.getTime() / 1000);
    embed._ts = epoch;
    embed.timestamp = item.pubDate.toISOString();
  } catch (e) {
    ctx.debug(`Failed to parse pubDate: "${item.pubDate}"`)
  }

  const image = html('img').attr('src');
  if (image) {
    if (settings.image_format.value == 'image') {
      embed.image = {url: image};
    } else if (settings.image_format.value == 'thumbnail') {
      embed.thumbnail = {url: image};
    }
  }
  ctx.debug(`Created embed "${embed.title}" (${embed.url})`);
  return embed;
}
