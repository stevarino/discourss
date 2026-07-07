/**
 * rss.js - functions related to processing RSS feeds.
 *
 * TODO(#6): Inspect to transparently handle both RSS and Atom feeds.
 */
import { Result, Feed, Embed, SettingsInterface } from './common.js';
import { Context } from './context.js';
export interface XMLFeed {
    title?: string;
    link?: string;
    items: XMLFeedItem[];
}
export interface XMLFeedItem {
    title: string;
    link: string;
    guid: string;
    pubDate: Date;
    description: string;
}
/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
export declare function processFeed(feed: Feed, ctx: Context): Result;
/** Parses XML Content and returns a normalized XMLFeed. */
export declare function parseXML(content: string): XMLFeed;
export declare function buildEmbed(ctx: Context, settings: SettingsInterface, item: XMLFeedItem): Embed;
