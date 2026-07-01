import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as cheerio from 'cheerio';
import { nodeToMarkdown } from './markdown.js';
function runMatrixTests(tests) {
    for (const [msg, html, md] of tests) {
        assert.strictEqual(nodeToMarkdown(cheerio.load(html)), md, msg);
    }
}
describe('markdown.ts nodeToMarkdown() unit tests', () => {
    test('converts basic text correctly without formatting', () => {
        const doc = cheerio.load('Hello World');
        assert.strictEqual(nodeToMarkdown(doc), 'Hello World');
    });
    test('converts HTML tags p, br, b, i, u to correct markdown', () => {
        const doc = cheerio.load('<p>This is <b>bold</b> and <i>italic</i> and <u>underlined</u>.</p><br><p>Second paragraph</p>');
        const md = nodeToMarkdown(doc);
        assert.strictEqual(md, 'This is **bold** and *italic* and __underlined__.\n\nSecond paragraph');
    });
    test('converts anchor tags a with href to markdown links', () => {
        const doc = cheerio.load('<a href="https://example.com">Example link</a>');
        assert.strictEqual(nodeToMarkdown(doc), '[Example link](https://example.com)');
    });
    test('skips empty anchor tags', () => {
        const doc = cheerio.load('<a href="https://example.com"></a>');
        assert.strictEqual(nodeToMarkdown(doc), '');
    });
    test('escapes markdown characters in plain text', () => {
        // Escapes *, _, [
        const doc = cheerio.load('This is *bold* and _italic_ and [link] in raw text');
        assert.strictEqual(nodeToMarkdown(doc), 'This is \\*bold\\* and \\_italic\\_ and \\[link] in raw text');
    });
    test('collapses multiple spaces and whitespace correctly', () => {
        const doc = cheerio.load('  Too    many    spaces  \n  with newlines  ');
        assert.strictEqual(nodeToMarkdown(doc), 'Too many spaces with newlines');
    });
    test('lists', () => {
        runMatrixTests([
            [
                'Unordered list processing',
                `<ul><li>alpha</li><li>bravo</li></ul>`,
                ' - alpha\n - bravo',
            ],
            [
                'Ordered list processing',
                `<ol><li>first</li><li>second</li></ol>`,
                ' 1. first\n 1. second',
            ],
            [
                'Unordered with an ordered',
                `<ul>
          <li>alpha
            <ol>
              <li>first</li>
              <li>second</li>
            </ol>
          </li>
          <li>bravo</li>
        </ul>`,
                ' - alpha\n   1. first\n   1. second\n - bravo',
            ],
            [
                'Ordered with an Unordered',
                `<ol>
          <li>first
            <ul>
              <li>alpha</li>
              <li>bravo</li>
            </ul>
          </li>
          <li>second</li>
        </ol>`,
                ' 1. first\n   - alpha\n   - bravo\n 1. second',
            ],
        ]);
    });
    test('blockquotes', () => {
        runMatrixTests([
            [
                'Basic blockquote',
                '<blockquote>alpha</blockquote>',
                ' > alpha'
            ],
            [
                'Multiline blockquote',
                '<blockquote>alpha<br><br>beta</blockquote>',
                ' > alpha\n >\n > beta'
            ],
        ]);
    });
});
