/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { truthy, DEFAULT_APP_NAME } from './common.js';
import { nodeToMarkdown } from './markdown.js';
const URL_ROOT = 'https://discourss.stevarino.com/feeds/';
function makeDomain(regex, logo, appname) {
    return { regex, appname, logo: URL_ROOT + logo };
}
const KNOWN_DOMAINS = [
    makeDomain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
    makeDomain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];
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
    const html = Cheerio.load(xml.getChild('description').getValue());
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
        const response = ctx.fetch(settings.webhook.value, {
            method: 'post',
            payload: JSON.stringify(msg),
            contentType: "application/json"
        });
        if (!response.getResponseCode().toString().startsWith('2')) {
            throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
        }
    }
}
