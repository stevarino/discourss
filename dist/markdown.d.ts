/**
 * markdown.js - Converts RSS HTML to Discord Markdown
 *
 * Odd things:
 *  - removes empty hyperlinks `[](https://...)`
 *  - does not render images
 *  - does not handle tables
 */
import * as cheerioLib from 'cheerio';
/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
export declare function nodeToMarkdown(doc: cheerioLib.CheerioAPI): string;
