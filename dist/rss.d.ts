/**
 * rss.js - functions related to processing RSS feeds.
 */
import { Result, SafeFeed } from './common.js';
import * as settings from './settings.js';
/**
 * Process Feed
 */
export declare function processFeed(feed: SafeFeed, ctx: settings.Context): Result;
