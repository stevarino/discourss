/**
 * rss.js - functions related to processing RSS feeds.
 */
import { STATUS } from './common.js';
import { buildEmbed } from './discord.js';
/**
 * Process Feed
 */
export function processFeed(feed, ctx) {
    // skip feed that has recently been scanned
    const diff = ctx.now - feed.time;
    if (diff < feed.settings.feed_frequency.value * 1000) {
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
function parseRssXml(content, feed, ctx) {
    var _a;
    const msg = {
        username: feed.discord,
        embeds: [],
    };
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
            msg.embeds.push(buildEmbed(ctx, feed.settings, item));
        }
        catch (e) {
            console.warn(`${feed.feed} [${guid}] Could not build embed: "${e}"`);
        }
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(feed.guid) !== '0') {
        status = 'new feed';
        msg.embeds.length = 0;
    }
    else {
        status = `found ${msg.embeds.length}`;
    }
    ctx.debug(`Processed ${msg.embeds.length} items`);
    return {
        status: STATUS.OK,
        status_text: status,
        guid: firstGuid,
        message: msg,
    };
}
