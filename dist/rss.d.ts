/**
 * rss.js - functions related to processing RSS feeds.
 */
import { Result, SafeFeed } from './common.js';
import { Context } from './context.js';
/**
 * Process Feed
 */
export declare function processFeed(feed: SafeFeed, ctx: Context): Result;
