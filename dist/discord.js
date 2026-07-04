/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { truthy, DEFAULT_APP_NAME } from './common.js';
import { nodeToMarkdown } from './markdown.js';
import { Ratelimiter } from './ratelimiter.js';
const SAFETY_MARGIN = 0.9;
const URL_ROOT = 'https://discourss.stevarino.com/feeds/';
class Domain {
    constructor(regex, logo, appname) {
        this.regex = regex;
        this.appname = appname;
        this.logo = URL_ROOT + logo;
    }
}
const KNOWN_DOMAINS = [
    new Domain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
    new Domain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];
const RATE_LIMITER = new Ratelimiter();
/**
 * Finds the index of the homogenous domain in embeds, or undefined if not
 * found or not homogenous.
 */
function findDomain(embeds) {
    var _a;
    const set = new Set(embeds.map((e) => {
        var _a;
        for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
            if (KNOWN_DOMAINS[i].regex.test((_a = e.url) !== null && _a !== void 0 ? _a : '')) {
                return i;
            }
        }
        return -1;
    }));
    if (set.size > 1) {
        return -1;
    }
    return (_a = set.values().next().value) !== null && _a !== void 0 ? _a : -1;
}
export function buildEmbed(_, settings, xml) {
    var _a, _b;
    const desc = xml.getChild('description');
    if (!desc) {
        throw new Error(`Missing description`);
    }
    const html = Cheerio.load(desc.getValue());
    const embed = {
        title: (_a = xml.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
        url: (_b = xml.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
        description: nodeToMarkdown(html),
        fields: [],
    };
    const image = html('img').attr('src');
    if (image) {
        if (settings.image_format.value == 'image') {
            embed.image = { url: image };
        }
        else if (settings.image_format.value == 'thumbnail') {
            embed.thumbnail = { url: image };
        }
    }
    // ctx.debug(`Created embed "${embed.title}" (${embed.url})`);
    return embed;
}
/**
 * Send a message through discord using the webhook.
 */
export function sendDiscordMessage(embeds, feed, ctx) {
    var _a, _b;
    const settings = feed.settings;
    if (!settings.webhook.value) {
        return;
    }
    const message = {
        embeds,
        username: settings.appname.value,
        content: String((_a = feed.discord) !== null && _a !== void 0 ? _a : ''),
        avatar_url: truthy(settings.avatar_url.value),
    };
    // evaluate message contents
    if (/^[0-9]+$/.test(message.content)) {
        message.allowed_mentions = { users: [message.content] };
        message.content = `<@${message.content}>`;
    }
    const signature = settings.signature.value;
    if (signature && signature.includes('%s')) {
        message.content = signature.replace('%s', message.content);
    }
    else if (signature) {
        message.content = signature;
    }
    // if we're not bundling, copy message for each embed.
    const messages = settings.bundle.value ? [message] :
        message.embeds.map(e => { return { ...message, embeds: [e] }; });
    for (const msg of messages) {
        const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
        msg.avatar_url = truthy(settings.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
        msg.username = (_b = truthy(settings.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname)) !== null && _b !== void 0 ? _b : DEFAULT_APP_NAME;
        // ctx.debug(`payload: ${JSON.stringify(msg)}`)
        applyLimits(ctx, [msg]).map(payload => {
            RATE_LIMITER.enqueue(ctx, settings.webhook.value, payload);
        });
    }
}
/**
 * Discord limits us to 10 embedded objects, 6000 characters total.
 *
 * https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
 */
function getSafeLimits(ctx) {
    return Object.fromEntries(Object.entries(ctx.limits).map(([k, v]) => [k, Math.floor(v * SAFETY_MARGIN)]));
}
export function applyLimits(ctx, messages) {
    var _a;
    const limits = getSafeLimits(ctx);
    for (let message of messages) {
        if (((_a = message.content) !== null && _a !== void 0 ? _a : '').length > limits.CONTENT_LENGTH) {
            message.content = message.content.slice(0, limits.CONTENT_LENGTH - 3) + '...';
        }
    }
    return messages
        .map(e => splitMessageByEmbeds(e, limits)).flat()
        .map(e => splitMessageByPayloadSize(ctx, e, limits)).flat();
}
function splitMessageByEmbeds(message, limits) {
    const messages = [message];
    while (message.embeds.length > limits.EMBED_COUNT) {
        const embeds = message.embeds;
        message.embeds = embeds.slice(0, limits.EMBED_COUNT);
        message = { ...message, embeds: embeds.slice(limits.EMBED_COUNT) };
        messages.push(message);
    }
    return messages;
}
function splitMessageByPayloadSize(ctx, message, limits) {
    const payload = JSON.stringify(message);
    if (payload.length <= limits.PAYLOAD_LENGTH) {
        return [payload];
    }
    // since we just care about string lengths, we're going to work in that rather
    // than converting back and fourth.
    const emptyPayload = JSON.stringify({ ...message, embeds: [] });
    const target = '"embeds":[';
    const index = emptyPayload.indexOf(target);
    if (index === -1) {
        // something really really broke.
        throw new Error(`'Unable to find target in payload: ${emptyPayload}`);
    }
    const payloadPre = emptyPayload.slice(0, index + target.length);
    const payloadPost = emptyPayload.slice(index + target.length);
    const budget = limits.PAYLOAD_LENGTH - emptyPayload.length;
    const embeds = message.embeds.map(e => JSON.stringify(e));
    const stagedEmbeds = [];
    const payloads = [];
    let total = 0;
    while (embeds.length > 0) {
        const embed = embeds.pop();
        if (embed.length > budget) {
            ctx.warn(`Embed skipped due to length (${embed.length} > ${budget})`);
            continue;
        }
        const extra = embed.length + 1;
        if (total + extra - 1 > budget) {
            payloads.push(`${payloadPre}${stagedEmbeds.join(',')}${payloadPost}`);
            total = 0;
            stagedEmbeds.length = 0;
        }
        stagedEmbeds.push(embed);
        total += embed.length + extra;
    }
    if (stagedEmbeds.length) {
        payloads.push(`${payloadPre}${stagedEmbeds.join(',')}${payloadPost}`);
    }
    return payloads;
}
