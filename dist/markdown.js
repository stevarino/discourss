/**
 * markdown.js - Converts RSS HTML to Discord Markdown
 *
 * Odd things:
 *  - removes empty hyperlinks `[](https://...)`
 *  - does not render images
 *  - does not handle tables
 */
import * as dom from 'domhandler';
/** characters that need to be escaped. */
const TO_ESCAPE = /\*|_|\[/g;
/** String wrapper used to preserve whitespace */
class Markdown {
    constructor(text) {
        this.text = text;
    }
    toString() {
        return this.text;
    }
    replace(searchValue, replaceValue) {
        return new Markdown(this.text.replace(searchValue, replaceValue));
    }
}
/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
export function nodeToMarkdown(doc) {
    return walkNodes(...doc.root().children());
}
function walkNodes(...nodes) {
    const parts = [];
    nodes.forEach(n => parts.push(...walkNode(n)));
    return flattenSeries(parts);
}
/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node, path) {
    path = path !== null && path !== void 0 ? path : [];
    if (dom.isTag(node)) {
        // console.log({tag: node.tagName, path, pre, post});
        const txt = [];
        for (const child of node.childNodes) {
            txt.push(...walkNode(child, [...path, node.tagName]));
        }
        return elementToMarkdown(node, path, txt);
    }
    if (dom.isCDATA(node)) {
        // untested - unsure if this is actually a thing?
        const children = [];
        for (const child of node.childNodes) {
            children.push(...walkNode(child, [...path, 'CDATA']));
        }
        return children;
    }
    if (dom.isText(node)) {
        return [node.data
                .replace(TO_ESCAPE, m => `\\${m}`)
                .replace(/[ \n\t]+/mg, ' ')];
    }
    return [];
}
function flattenSeries(series) {
    // accumulator of continuous strings
    const strings = [];
    // final output markdown
    const markdown = [];
    // clears the strings array while returning the merged and normalized output.
    const mergeStrings = () => {
        const str = strings.join('')
            // collapse spaces around newlines
            .replace(/[ ]*\n[ ]*/g, '\n')
            // collapse spaces
            .replace(/[ ]{2,}/g, ' ');
        strings.length = 0;
        return str;
    };
    for (const part of series) {
        if (part instanceof Markdown) {
            markdown.push(mergeStrings(), part.toString());
        }
        else if (typeof part === 'string') {
            strings.push(part);
        }
    }
    markdown.push(mergeStrings());
    return markdown.join('')
        // trim beginnning newlines
        .replace(/^\s*\n/, '')
        // trim end whitespace
        .trimEnd()
        // trim end-of-line spaces
        .replace(/[ ]+\n/g, '\n')
        // collapse more than two newlines
        .replace(/\n{2,}/g, '\n\n');
}
// lists should have a double-newline if not embedded, but a
// single newline if embedded within another list. The first
// newline is optional, from the <ul> or <ol>, and the second
// is from the enclosed <li>..
const LIST_NL = (_, path) => {
    const lists = path.filter(p => p === 'ul' || p === 'ol');
    const nl = lists.length ? '' : '\n';
    return nl;
};
/** mapping of tag names to end bits. */
const elementParts = {
    br: ['', '\n'],
    p: ['\n\n', '\n\n'],
    b: ['**', '**'],
    i: ['*', '*'],
    u: ['__', '__'],
    a: [
        // if there's no child content, skip the link.
        el => walkNodes(...el.childNodes) === '' ? '' : '[',
        el => walkNodes(...el.childNodes) === '' ? '' : `](${el.attribs['href']})`
    ],
    ul: [LIST_NL, LIST_NL],
    ol: [LIST_NL, LIST_NL],
    li: [
        (_, path) => {
            // lists are indented by how deeply they are nested
            const lists = path.filter(p => p === 'ul' || p === 'ol');
            const depth = Math.max(0, lists.length - 1);
            const marker = lists[lists.length - 1] === 'ol'
                ? ' 1. ' : ' - ';
            return new Markdown('\n' + '  '.repeat(depth) + marker);
        }, '',
    ],
    blockquote: [
        '\n\n', '\n\n', (children) => {
            return [new Markdown(flattenSeries([new Markdown(' > '), ...children]).replace(/\n/g, '\n > '))];
        }
    ]
};
/**
 * given an element, return the pre and post bits
 */
function elementToMarkdown(node, path, children) {
    var _a;
    const [pre, post, content] = (_a = elementParts[node.tagName.toLocaleLowerCase()]) !== null && _a !== void 0 ? _a : [];
    const evalTerm = (term) => {
        if (typeof term === 'function') {
            return term(node, path, children);
        }
        return term !== null && term !== void 0 ? term : '';
    };
    return [
        evalTerm(pre),
        ...(content ? content(children) : children),
        evalTerm(post),
    ];
}
