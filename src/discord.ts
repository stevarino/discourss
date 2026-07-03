/** 
 * feeds.js - Convert an RSS item to a Discord Embed.
 */

import { Context } from './context.js';
import { Embed, Message, Feed, truthy, XmlElement, DEFAULT_APP_NAME, SettingsInterface, FetchRequest } from './common.js';
import { nodeToMarkdown } from './markdown.js';

const SAFETY_MARGIN = 0.9;

const URL_ROOT = 'https://discourss.stevarino.com/feeds/';

function makeDomain(regex: RegExp, logo: string, appname: string) {
  return {regex, appname, logo: URL_ROOT + logo};
}

const KNOWN_DOMAINS = [
  makeDomain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
  makeDomain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];

/** 
 * Finds the index of the homogenous domain in embeds, or undefined if not
 * found or not homogenous.
 */
function findDomain(embeds: Embed[]): number {
  const set = new Set(embeds.map((e: Embed) => {
    for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
      if (KNOWN_DOMAINS[i].regex.test(e.url ?? '')) {
        return i;
      }
    }
    return -1;
  }));
  if (set.size > 1) {
    return -1;
  }
  return set.values().next().value ?? -1;
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

/**
 * Send a message through discord using the webhook.
 */
export function sendDiscordMessage(embeds: Embed[], feed: Feed, ctx: Context): void {
  const settings = feed.settings;
  if (!settings.webhook.value) {
    return;
  }
  const message: Message = {
    embeds,
    username: settings.appname.value,
    content: String(feed.discord ?? ''),
    avatar_url: truthy(settings.avatar_url.value),
  };

  // evaluate message contents
  if (/^[0-9]+$/.test(message.content!)) {
    message.allowed_mentions = {users: [message.content!]};
    message.content = `<@${message.content!}>`;
  }
  const signature = settings.signature.value;
  if (signature && signature.includes('%s')) {
    message.content = signature.replace('%s', message.content!);
  } else if (signature) {
    message.content = signature;
  }

  // if we're not bundling, copy message for each embed.
  const messages: Message[] = settings.bundle.value ? [message] : 
    message.embeds.map(e => {return {...message, embeds: [e]}});

  for (const msg of messages) {
    const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
    msg.avatar_url = truthy(settings.avatar_url.value, domain?.logo);
    msg.username = truthy(settings.appname.value, domain?.appname) ?? DEFAULT_APP_NAME;
    // ctx.debug(`payload: ${JSON.stringify(msg)}`)

    for (const splitMsg of applyLimits(ctx, [msg])) {
      const response = ctx.fetch(settings.webhook.value, {
        method: 'post',
        payload: JSON.stringify(splitMsg),
        contentType: "application/json"
      } as FetchRequest);
      console.info(response.getHeaders())
      if (!response.getResponseCode().toString().startsWith('2')) {
        throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
      }
    }
  }
}

/** 
 * Discord limits us to 10 embedded objects, 6000 characters total.
 * 
 * https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
 */
function getSafeLimits(ctx: Context) {
  return Object.fromEntries(Object.entries(ctx.limits).map(
    ([k, v]) => [k, Math.floor(v * SAFETY_MARGIN)]
  )) as typeof ctx.limits;
}

export function applyLimits(ctx: Context, messages: Message[]): Message[] {
  const limits = getSafeLimits(ctx);
  for (let message of messages) {
    if ((message.content ?? '').length > limits.CONTENT_LENGTH) {
      message.content = message.content!.slice(0, limits.CONTENT_LENGTH - 3) + '...';
    }
  }
  return messages
    .map(e => splitMessageByEmbeds(e, limits)).flat()
    .map(e => splitMessageByPayloadSize(ctx, e, limits)).flat();
}

function splitMessageByEmbeds(message: Message, limits: ReturnType<typeof getSafeLimits>) {
  const messages: Message[] = [message];
  while (message.embeds.length > limits.EMBED_COUNT) {
    const embeds = message.embeds;
    message.embeds = embeds.slice(0, limits.EMBED_COUNT);
    message  = {...message, embeds: embeds.slice(limits.EMBED_COUNT)};
    messages.push(message);
  }
  return messages;
}

function splitMessageByPayloadSize(ctx: Context, message: Message, limits: ReturnType<typeof getSafeLimits>) {
  const payload = JSON.stringify(message);
  const messages: Message[] = [message];
  if (payload.length <= limits.PAYLOAD_LENGTH) {
    return messages;
  }
  const base = JSON.stringify({...message, embeds: []}).length;
  const budget = limits.PAYLOAD_LENGTH - base;
  const embeds = message.embeds.map(e => [JSON.stringify(e).length, e]) as [number, Embed][];
  message.embeds.length = 0;
  let total = 0;
  while (embeds.length > 0) {
    const [size, embed] = embeds.pop()!;
    if (size > budget) {
      ctx.warn(`Embed skipped due to length (${size} > ${budget})`);
      continue;
    }
    if (total + size > budget) {
      total = 0;
      message = {...message, embeds: []};
      messages.push(message);
    }
    total += size;
    message.embeds.push(embed);
  }
  return messages
}
