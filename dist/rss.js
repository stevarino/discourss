/**
 * rss.js - functions related to processing RSS feeds.
 */
import { STATUS, renderLogHeader } from './common.js';
import { nodeToMarkdown } from './markdown.js';
/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
export function processFeed(feed, ctx) {
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
    return parseRssXml(text, feed, ctx);
}
function parseRssXml(content, feed, ctx) {
    var _a;
    const embeds = [];
    const doc = XmlService.parse(content.trim());
    const root = doc.getRootElement();
    if (!root) {
        throw Error('Failed to parse feed');
    }
    const channel = root.getChild('channel');
    if (!channel) {
        throw Error('channel element not found');
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
        const guid = (_a = item.getChild('guid')) === null || _a === void 0 ? void 0 : _a.getText();
        // ctx.debug(`Found item: ${guid}`);
        if (!guid) {
            ctx.warn(`GUID not specified on feed item. Skipping.`);
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
        }
        catch (e) {
            ctx.warn(`${renderLogHeader(feed)} [${guid}] Could not process embed: "${e}"`);
        }
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(feed.guid) !== '0') {
        status = 'new feed';
        embeds.length = 0;
    }
    else {
        status = `found ${embeds.length}`;
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
export function buildEmbed(_, settings, xml) {
    var _a, _b, _c;
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
    const pubDate = (_c = xml.getChild('pubDate')) === null || _c === void 0 ? void 0 : _c.getValue();
    if (pubDate) {
        try {
            const date = new Date(pubDate);
            const epoch = Math.floor(date.getTime() / 1000);
            embed._ts = epoch;
            embed.timestamp = date.toISOString();
        }
        catch (e) {
            console.warn(`Failed to parse pubDate: "${pubDate}"`);
        }
    }
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
