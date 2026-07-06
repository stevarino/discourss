/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { Context } from './context.js';
import { Feed, FeedRequest, Embed } from './common.js';
/** Normalizes messages and splits them up by feed limits. */
export declare function normalizeMessages(ctx: Context, feed: Feed, embeds: Embed[]): FeedRequest[];
