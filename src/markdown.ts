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

/** characters that need to be escaped. */
const TO_ESCAPE = /\*|_|\[/g

/** String wrapper used to preserve whitespace */
class Markdown {
  constructor(public text: string) {}
  
  toString(): string {
    return this.text;
  }

  replace(searchValue: string|RegExp, replaceValue: string) {
    return new Markdown(
      this.text.replace(searchValue, replaceValue));
  }
}

type Series = (string|Markdown)[]

/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
export function nodeToMarkdown(doc: cheerioLib.CheerioAPI): string {
  return walkNodes(...doc.root().children());
}

function walkNodes(...nodes: dom.ChildNode[]): string {
  const parts: Series = [];
  nodes.forEach(n => parts.push(...walkNode(n)));
  return flattenSeries(parts);
}

/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node: dom.ChildNode, path?: string[]): (Markdown|string)[] {
  path = path ?? [];
  if (dom.isTag(node)) {
    // console.log({tag: node.tagName, path, pre, post});
    const txt: Series = [];
    for (const child of node.childNodes) {
      txt.push(...walkNode(child, [...path, node.tagName]));
    }
    return elementToMarkdown(node, path, txt);
  }
  if (dom.isCDATA(node)) {
    // untested - unsure if this is actually a thing?
    const children: (Markdown|string)[] = [];
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

function flattenSeries(series: Series) {
  // accumulator of continuous strings
  const strings: string[] = [];
  // final output markdown
  const markdown: string[] = [];
  // clears the strings array while returning the merged and normalized output.
  const mergeStrings = (): string => {
    const str = strings.join('')
      // collapse spaces around newlines
      .replace(/[ ]*\n[ ]*/g, '\n')
      // collapse spaces
      .replace(/[ ]{2,}/g, ' ')
    strings.length = 0;
    return str;
  }
  for (const part of series) {
    if (part instanceof Markdown) {
      markdown.push(mergeStrings(), part.toString());
    } else if (typeof part === 'string') {
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

/** Terminator: what prepends or appends a tag */
type Term = string | Markdown | (
  (node: dom.Element, path: string[], content: Series) => string|Markdown);

// lists should have a double-newline if not embedded, but a
// single newline if embedded within another list. The first
// newline is optional, from the <ul> or <ol>, and the second
// is from the enclosed <li>..
const LIST_NL: Term =  (_, path: string[]) => {
  const lists = path.filter(p => p === 'ul' || p === 'ol');
  const nl = lists.length ? '' : '\n';
  return nl
};


/** mapping of tag names to end bits. */
const elementParts: Record<string, [
      // opening and closing parts
      pre: Term, post: Term
    ] | [
      // opening, closing parts and transforming children
      pre: Term, post: Term, content:  (children: Series) => Series
    ]> = {
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
      return [new Markdown(
        flattenSeries([new Markdown(' > '), ...children]).replace(/\n/g, '\n > ')
      )]
    }
  ]
}

/**
 * given an element, return the pre and post bits
 */
function elementToMarkdown(node: dom.Element, path: string[], children: Series): Series {
  const [pre, post, content] = elementParts[node.tagName.toLocaleLowerCase()] ?? [];
  const evalTerm = (term: Term) => {
    if (typeof term === 'function') {
      return term(node, path, children)
    }
    return term ?? '';
  }
  return [
    evalTerm(pre),
    ...(content ? content(children) : children),
    evalTerm(post),
  ]
}

