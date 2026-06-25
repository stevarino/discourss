/**
 * markdown.js - Converts RSS HTML to Discord Markdown
 *
 * Odd things:
 *  - removes empty hyperlinks `[](https://...)`
 *  - does not render images
 *  - does not handle tables
 */
import * as dom from 'domhandler';
/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
export function nodeToMarkdown(doc) {
    return walkNodes(...doc.root().children());
}
function walkNodes(...nodes) {
    return nodes.map(n => walkNode(n).join('')).join('').trim()
        // collapse spaces around newlines
        .replace(/[ ]*\n[ ]*/g, '\n')
        // collapse spaces
        .replace(/[ ]{2,}/g, ' ');
}
/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node, path) {
    path = path !== null && path !== void 0 ? path : [];
    if (dom.isTag(node)) {
        const [pre, post] = getEndBits(node);
        const txt = [pre];
        for (const child of node.childNodes) {
            txt.push(...walkNode(child, [...path, node.tagName]));
        }
        txt.push(post);
        // console.log([...path, node.tagName].join('.'), JSON.stringify(txt));
        return txt;
    }
    if (dom.isCDATA(node)) {
        const children = [];
        for (const child of node.childNodes) {
            children.push(...walkNode(child, [...path, 'CDATA']));
        }
        return children;
    }
    if (dom.isText(node)) {
        return [node.data
                .replace(markdownChars, match => `\\${match}`)
                .replace(/[ \n\t]+/mg, ' ')];
    }
    return [];
}
/** mapping of tag names to end bits. */
const endBits = {
    p: ['', '\n\n'],
    br: ['', '\n'],
    b: ['**', '**'],
    i: ['*', '*'],
    u: ['__', '__'],
    a: [
        // if there's no child content, skip the link.
        el => walkNodes(...el.childNodes) === '' ? '' : '[',
        el => walkNodes(...el.childNodes) === '' ? '' : `](${el.attribs['href']})`
    ],
};
/**
 * given an element, return the pre and post bits
 */
function getEndBits(node) {
    var _a;
    return ((_a = endBits[node.tagName.toLocaleLowerCase()]) !== null && _a !== void 0 ? _a : ['', '']).map(bit => typeof bit === 'function' ? bit(node) : bit);
}
/** characters that need to be escaped. */
const markdownChars = /\*|_|\[/g;
