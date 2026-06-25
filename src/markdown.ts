/**
 * markdown.js - Converts RSS HTML to Discord Markdown
 * 
 * Odd things:
 *  - removes empty hyperlinks `[](https://...)`
 *  - does not render images
 *  - does not handle tables
 */

import * as dom from 'domhandler';
import * as cheerioLib from 'cheerio';

/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
export function nodeToMarkdown(doc: cheerioLib.CheerioAPI): string {
  return walkNodes(...doc.root().children());
}

function walkNodes(...nodes: dom.ChildNode[]): string {
  return nodes.map(n => walkNode(n).join('')).join('').trim()
    // collapse spaces around newlines
    .replace(/[ ]*\n[ ]*/g, '\n')
    // collapse spaces
    .replace(/[ ]{2,}/g, ' ');
}

/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node: dom.ChildNode, path?: string[]): string[] {
  path = path ?? [];
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
    const children: string[] = [];
    for (const child of node.childNodes) {
      children.push(...walkNode(child, [...path, 'CDATA']));
    }
    return children;
  }
  if (dom.isText(node)) {
    return [node.data
      .replace(markdownChars, match=> `\\${match}`)
      .replace(/[ \n\t]+/mg, ' ')];
  }
  return [];
}

/** what prepends or appends a tag */
type EndBit = string|((node: dom.Element) => string);



/** mapping of tag names to end bits. */
const endBits: Record<string, [EndBit, EndBit]> = {
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
}

/**
 * given an element, return the pre and post bits
 */
function getEndBits(node: dom.Element): [string, string] {
  return (endBits[node.tagName.toLocaleLowerCase()] ?? ['','']).map(bit =>
    typeof bit === 'function' ? bit(node) : bit
  ) as [string, string];
}

/** characters that need to be escaped. */
const markdownChars = /\*|_|\[/g

