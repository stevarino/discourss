/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { DEFAULT_APP_NAME, first } from './common.js';
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
function findDomainFromURL(url) {
    for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
        if (KNOWN_DOMAINS[i].regex.test(url)) {
            return i;
        }
    }
    return -1;
}
/**
 * https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
 */
function getSafeLimits(ctx) {
    return Object.fromEntries(Object.entries(ctx.limits).map(([k, v]) => [k, Math.floor(v * SAFETY_MARGIN)]));
}
/** Normalizes messages and splits them up by feed limits. */
export function normalizeMessages(ctx, feed, embeds) {
    var _a, _b;
    const feedPayloads = [];
    const limits = getSafeLimits(ctx);
    const message = { embeds };
    const settings = feed.settings;
    let user = String((_a = feed.discord) !== null && _a !== void 0 ? _a : '');
    // is feed.discord a Discord User ID?
    if (/^[0-9]+$/.test(user)) {
        message.allowed_mentions = { users: [user] };
        user = `<@${user}>`;
    }
    if (settings.signature.value) {
        user = settings.signature.value.replace('%s', user);
    }
    if ((user).length > limits.CONTENT_LENGTH) {
        user = user.slice(0, limits.CONTENT_LENGTH - 3) + '...';
    }
    message.content = user;
    const domain = KNOWN_DOMAINS[findDomainFromURL(feed.feed)];
    message.avatar_url = first(settings.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
    message.username = first(settings.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname, DEFAULT_APP_NAME);
    const initialLength = feedPayloads.length;
    if (settings.bundle.value) {
        // bundling, so fit as many embedded messages into a request as possible.
        for (const splitMsg of splitMessageByEmbeds(message, limits)) {
            for (const feedPayload of splitMessageByPayloadSize(ctx, feed, splitMsg, limits)) {
                feedPayloads.push(feedPayload);
            }
        }
    }
    else {
        // not bundling, split the messages up, one embed per message.
        for (const embed of message.embeds) {
            const payload = stringify({ ...message, embeds: [embed] });
            feedPayloads.push({ feed, payload, epoch: (_b = embed._ts) !== null && _b !== void 0 ? _b : 0 });
        }
    }
    feed.counters.unprocessed = feedPayloads.length - initialLength;
    return feedPayloads;
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
function splitMessageByPayloadSize(ctx, feed, message, limits) {
    var _a, _b;
    const payload = stringify(message);
    if (payload.length <= limits.PAYLOAD_LENGTH) {
        return [{ feed, epoch: (_b = (_a = message.embeds[0]) === null || _a === void 0 ? void 0 : _a._ts) !== null && _b !== void 0 ? _b : 0, payload }];
    }
    /** output collection */
    const payloads = [];
    // since we just care about string lengths, we're going to work in that rather
    // than converting back and fourth.
    const emptyPayload = stringify({ ...message, embeds: [] });
    const target = '"embeds":[';
    const index = emptyPayload.indexOf(target);
    if (index === -1) {
        // something really really broke.
        throw new Error(`'Unable to find target in payload: ${emptyPayload}`);
    }
    const payloadPre = emptyPayload.slice(0, index + target.length);
    const payloadPost = emptyPayload.slice(index + target.length);
    /** How many characters we have to work with */
    const budget = limits.PAYLOAD_LENGTH - emptyPayload.length;
    const embeds = [...message.embeds];
    const stagedPayloads = [];
    /** Earliest epoch in a bundle */
    let epoch = undefined;
    while (embeds.length > 0) {
        const embed = embeds.pop();
        const payload = stringify(embed);
        if (payload.length > budget) {
            feed.counters.invalid += 1;
            ctx.warn(`Embed skipped due to length (${payload.length} > ${budget})`);
            continue;
        }
        const extra = payload.length + 1;
        const total = stagedPayloads.length === 0 ? 0 : (stagedPayloads.map(s => s.length).reduce((a, b) => a + b)) + stagedPayloads.length;
        if (total + extra > budget) {
            payloads.push({
                feed,
                epoch: epoch !== null && epoch !== void 0 ? epoch : 0,
                payload: `${payloadPre}${stagedPayloads.join(',')}${payloadPost}`
            });
            stagedPayloads.length = 0;
            epoch = undefined;
        }
        if (embed._ts) {
            epoch = Math.min(embed._ts, epoch !== null && epoch !== void 0 ? epoch : embed._ts);
        }
        stagedPayloads.push(payload);
    }
    if (stagedPayloads.length) {
        payloads.push({
            feed,
            epoch: epoch !== null && epoch !== void 0 ? epoch : 0,
            payload: `${payloadPre}${stagedPayloads.join(',')}${payloadPost}`
        });
    }
    return payloads;
}
/** Calls JSON.stringify, filtering out hidden fields. */
function stringify(obj) {
    return JSON.stringify(obj, (key, val) => key.startsWith('_') ? undefined : val);
}
