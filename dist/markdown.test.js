import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as cheerio from 'cheerio';
import { nodeToMarkdown } from './markdown.js';
describe('markdown.ts nodeToMarkdown() unit tests', () => {
    test('converts basic text correctly without formatting', () => {
        const $ = cheerio.load('Hello World');
        assert.strictEqual(nodeToMarkdown($), 'Hello World');
    });
    test('converts HTML tags p, br, b, i, u to correct markdown', () => {
        const $ = cheerio.load('<p>This is <b>bold</b> and <i>italic</i> and <u>underlined</u>.</p><br><p>Second paragraph</p>');
        const md = nodeToMarkdown($);
        assert.strictEqual(md, 'This is **bold** and *italic* and __underlined__.\n\n\nSecond paragraph');
    });
    test('converts anchor tags a with href to markdown links', () => {
        const $ = cheerio.load('<a href="https://example.com">Example link</a>');
        assert.strictEqual(nodeToMarkdown($), '[Example link](https://example.com)');
    });
    test('skips empty anchor tags', () => {
        const $ = cheerio.load('<a href="https://example.com"></a>');
        assert.strictEqual(nodeToMarkdown($), '');
    });
    test('escapes markdown characters in plain text', () => {
        // Escapes *, _, [
        const $ = cheerio.load('This is *bold* and _italic_ and [link] in raw text');
        assert.strictEqual(nodeToMarkdown($), 'This is \\*bold\\* and \\_italic\\_ and \\[link] in raw text');
    });
    test('collapses multiple spaces and whitespace correctly', () => {
        const $ = cheerio.load('  Too    many    spaces  \n  with newlines  ');
        assert.strictEqual(nodeToMarkdown($), 'Too many spaces with newlines');
    });
});
