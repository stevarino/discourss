/**
 * rss.js - functions related to processing RSS feeds.
 */

import { Result, STATUS, Feed, XmlDocument, Embed, SettingsInterface, XmlElement } from './common.js';
import { Context } from './context.js';
import { nodeToMarkdown } from './markdown.js';

/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
export function processFeed(feed: Feed, ctx: Context): Result {
  // skip feed that has recently been scanned
  const diff = ctx.now - feed.time;
  if (diff < feed.settings.feed_frequency.value) {
    ctx.info(`${feed.feed} - hit frequency limit of ${feed.settings.feed_frequency} seconds (${diff / 1000}s) - skipping`);
    return { status: STATUS.SKIP, status_text: '' };
  }

  ctx.info(`${feed.feed} - fetching`);
  const res = ctx.fetch(feed.feed);
  if (!String(res.getResponseCode()).startsWith('2')) {
    return {
      status: STATUS.ERROR, 
      status_text: `HTTP Response code: ${res.getResponseCode()}`
    };
  }
  const text = res.getContentText();
  ctx.debug(`Received ${text.length} bytes`);
  return parseRssXml(text, feed, ctx);
}


function parseRssXml(content: string, feed: Feed, ctx: Context): Result {
  const embeds: Embed[] = [];

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
  ctx.debug(`Loaded RSS: ${items.length} items`);
  if (items.length === 0) {
    firstGuid = '0';
    status = 'no items';
  }
  for (const item of items) {
    const guid = item.getChild('guid')?.getText();
    // ctx.debug(`Found item: ${guid}`);
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
    try {
      embeds.push(buildEmbed(ctx, feed.settings, item));
    } catch (e) {
      console.warn(`${feed.feed} [${guid}] Could not build embed: "${e}"`)
    }
  }

  // TODO: better separate this.
  // new (to us) feed. we only care about entries moving forward, not
  // entries we have already seen.
  if(!foundLast && String(feed.guid) !== '0') {
    status = 'new feed';
    embeds.length = 0;
  } else {
    status = `found ${embeds.length}`
  }

  // oldest first
  embeds.reverse();
  ctx.debug(`Processed ${embeds.length} items`);
  const result = { 
    status: STATUS.OK,
    status_text: status,
    guid: firstGuid,
    embeds: embeds,
  };
  feed.result = result;
  return result;
}

export function buildEmbed(_: Context, settings: SettingsInterface, xml: XmlElement): Embed {
  const desc = xml.getChild('description');
  if (!desc) {
    throw new Error(`Missing description`);
  }
  const html = Cheerio.load(desc.getValue());
  const embed: Embed = {
    title: xml.getChild("title")?.getText(),
    url: xml.getChild('link')?.getText(),
    description: nodeToMarkdown(html),
    fields: [],
  }

  const pubDate = xml.getChild('pubDate')?.getValue();
  if (pubDate) {
    try {
      const epoch = Math.floor(new Date(pubDate).getTime() / 1000);
      embed._ts = epoch;
      embed.footer = `Published <t:${epoch}:R>`;
    } catch (e) {
      console.warn(`Failed to parse pubDate: "${pubDate}"`)
    }
  }

  const image = html('img').attr('src');
  if (image) {
    if (settings.image_format.value == 'image') {
      embed.image = {url: image};
    } else if (settings.image_format.value == 'thumbnail') {
      embed.thumbnail = {url: image};
    }
  }
  // ctx.debug(`Created embed "${embed.title}" (${embed.url})`);
  return embed;
}
