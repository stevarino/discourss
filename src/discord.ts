/** 
 * feeds.js - Convert an RSS item to a Discord Embed.
 */

import { Context } from './context.js';
import { Embed, Message, SafeFeed, truthy, XmlElement } from './common.js';
import { nodeToMarkdown } from './markdown.js';

const DEFAULT_APP_NAME = 'DiscouRSS';

const URL_ROOT = 'https://discourss.stevarino.com/feeds/';

function makeDomain(regex: RegExp, logo: string, appname: string) {
  return {regex, appname, logo: URL_ROOT + logo};
}

const KNOWN_DOMAINS = [
  makeDomain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
  makeDomain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];

function matchDomain(url: string): number {
  for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
    if (KNOWN_DOMAINS[i].regex.test(url ?? '')) {
      return i;
    }
  }
  return -1;
}

/** 
 * Finds the index of the homogenous domain in embeds, or undefined if not
 * found or not homogenous.
 */
function findDomain(embeds: Embed[]): number {
  const set = new Set(embeds.map(e => matchDomain(e.url ?? '')));
  if (set.size > 1) {
    return -1;
  }
  return set.values().next().value ?? -1;
}

export function buildEmbed(ctx: Context, xml: XmlElement): Embed {
  const html = Cheerio.load(xml.getChild('description')!.getValue());
  const embed: Embed = {
    title: xml.getChild("title")?.getText(),
    url: xml.getChild('link')?.getText(),
    description: nodeToMarkdown(html),
    fields: [],
  }

  if (ctx.debug) {
    embed.fields.push({name: 'guid', value: xml.getChild('guid')!.getText()});
  }

  const image = html('img').attr('src');
  if (image) {
    if (ctx.image_format.value == 'image') {
      embed.image = {url: image};
    } else if (ctx.image_format.value == 'thumbnail') {
      embed.thumbnail = {url: image};
    }
  }
  return embed;
}

/**
 * Send a message through discord using the webhook.
 */
export function sendDiscordMessage(embeds: Embed[], feed: SafeFeed, ctx: Context): void {
  if (!ctx.webhook.value) {
    return;
  }
  const message: Message = {
    embeds,
    username: ctx.appname.value,
    content: String(feed.discord ?? ''),
    avatar_url: truthy(ctx.avatar_url.value),
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

  // if we're not bundling, copy message for each embed.
  const messages: Message[] = ctx.bundle.value ? [message] : 
    message.embeds.map(e => {return {...message, embeds: [e]}});

  for (const msg of messages) {
    const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
    msg.avatar_url = truthy(ctx.avatar_url.value, domain?.logo);
    msg.username = truthy(ctx.appname.value, domain?.appname) ?? DEFAULT_APP_NAME;
    const response = ctx.fetch(ctx.webhook.value, {
      method: 'post',
      payload: JSON.stringify(msg),
      muteHttpExceptions: true,
      contentType: "application/json"
    });
    if (response.getResponseCode() != 204) {
      throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
    }
  }
}
