/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { truthy } from './common.js';
import { nodeToMarkdown } from './markdown.js';
const DEFAULT_APP_NAME = 'DiscouRSS';
const URL_ROOT = 'https://discourss.stevarino.com/feeds/';
function makeDomain(regex, logo, appname) {
    return { regex, appname, logo: URL_ROOT + logo };
}
const KNOWN_DOMAINS = [
    makeDomain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
    makeDomain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];
function matchDomain(url) {
    for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
        if (KNOWN_DOMAINS[i].regex.test(url !== null && url !== void 0 ? url : '')) {
            return i;
        }
    }
    return -1;
}
/**
 * Finds the index of the homogenous domain in embeds, or undefined if not
 * found or not homogenous.
 */
function findDomain(embeds) {
    var _a;
    const set = new Set(embeds.map(e => { var _a; return matchDomain((_a = e.url) !== null && _a !== void 0 ? _a : ''); }));
    if (set.size > 1) {
        return -1;
    }
    return (_a = set.values().next().value) !== null && _a !== void 0 ? _a : -1;
}
export function buildEmbed(ctx, xml) {
    var _a, _b;
    const html = Cheerio.load(xml.getChild('description').getValue());
    const embed = {
        title: (_a = xml.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
        url: (_b = xml.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
        description: nodeToMarkdown(html),
        fields: [],
    };
    if (ctx.debug) {
        embed.fields.push({ name: 'guid', value: xml.getChild('guid').getText() });
    }
    const image = html('img').attr('src');
    if (image) {
        if (ctx.image_format.value == 'image') {
            embed.image = { url: image };
        }
        else if (ctx.image_format.value == 'thumbnail') {
            embed.thumbnail = { url: image };
        }
    }
    return embed;
}
/**
 * Send a message through discord using the webhook.
 */
export function sendDiscordMessage(embeds, feed, ctx) {
    var _a, _b;
    if (!ctx.webhook.value) {
        return;
    }
    const message = {
        embeds,
        username: ctx.appname.value,
        content: String((_a = feed.discord) !== null && _a !== void 0 ? _a : ''),
        avatar_url: truthy(ctx.avatar_url.value),
    };
    // evaluate message contents
    if (/^[0-9]+$/.test(message.content)) {
        message.allowed_mentions = { users: [message.content] };
        message.content = `<@${message.content}>`;
    }
    const signature = ctx.signature.value;
    if (signature && signature.includes('%s')) {
        message.content = signature.replace('%s', message.content);
    }
    // if we're not bundling, copy message for each embed.
    const messages = ctx.bundle.value ? [message] :
        message.embeds.map(e => { return { ...message, embeds: [e] }; });
    for (const msg of messages) {
        const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
        msg.avatar_url = truthy(ctx.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
        msg.username = (_b = truthy(ctx.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname)) !== null && _b !== void 0 ? _b : DEFAULT_APP_NAME;
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
