// Strict SVG contract used for accepted Lineage artifacts. No filesystem effects.
export const MAX_SVG_BYTES = 5 * 1024 * 1024;

const ACTIVE_SVG_ELEMENTS = new Set([
  "a", "animate", "animateMotion", "animateTransform", "discard", "foreignObject", "handler", "iframe",
  "link", "listener", "object", "script", "set", "style",
]);
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu;

function validateXmlCharacters(value) {
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined || point === 0 || (point < 0x20 && ![0x09, 0x0a, 0x0d].includes(point))
      || (point >= 0xd800 && point <= 0xdfff) || point > 0x10ffff
      || (point & 0xffff) === 0xfffe || (point & 0xffff) === 0xffff) {
      throw new Error("Accepted artifact contains an invalid XML character.");
    }
  }
}

function decodeXmlValue(value) {
  validateXmlCharacters(value);
  if (value.includes("<") || value.replace(XML_ENTITY, "").includes("&")) throw new Error("Accepted artifact contains invalid XML text.");
  return value.replace(XML_ENTITY, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const point = Number.parseInt(entity.slice(entity[2] === "x" ? 3 : 2, -1), entity[2] === "x" ? 16 : 10);
    const decoded = Number.isSafeInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : "\u0000";
    validateXmlCharacters(decoded);
    return decoded;
  });
}

function validateSvgAttributes(tagName, attributes, inheritedXlink) {
  let xlinkDeclared = inheritedXlink;
  const decoded = new Map();
  for (const [name, raw] of attributes) decoded.set(name, decodeXmlValue(raw));
  if (decoded.has("xmlns") && decoded.get("xmlns") !== "http://www.w3.org/2000/svg") throw new Error("Accepted artifact declares an unsupported default namespace.");
  if (decoded.has("xmlns:xlink")) {
    if (decoded.get("xmlns:xlink") !== "http://www.w3.org/1999/xlink") throw new Error("Accepted artifact declares an unsupported link namespace.");
    xlinkDeclared = true;
  }
  for (const [name, value] of decoded) {
    const lower = name.toLowerCase();
    if (/^data-(?:lineage|agent|review|transport)-/iu.test(name) || lower.startsWith("on") || lower === "style") {
      throw new Error("Accepted artifact contains editor, protocol, or active metadata.");
    }
    if (name.includes(":")) {
      if (name === "xmlns:xlink") continue;
      if (name === "xlink:href" && xlinkDeclared) { /* supported link namespace */ }
      else if (name === "xml:lang" || name === "xml:space") { /* supported XML namespace */ }
      else throw new Error("Accepted artifact contains an unsupported attribute namespace.");
    } else if (name === "xmlns") continue;
    if ((lower === "href" || lower === "src" || lower === "xlink:href") && !value.startsWith("#")) {
      throw new Error("Accepted artifact contains an external reference.");
    }
    if (value.includes("\\") || value.includes("/*")) throw new Error("Accepted artifact contains an escaped URL-bearing construct.");
    for (const match of value.matchAll(/url\(\s*([^)]*)\)/giu)) {
      if (!match[1].trim().replace(/^['"]|['"]$/gu, "").startsWith("#")) throw new Error("Accepted artifact contains an external URL.");
    }
    if (/(?:^|[\s('"=])(?:https?|file|data|javascript):|^\/\//iu.test(value)) throw new Error("Accepted artifact contains a URL-bearing construct.");
  }
  if ((tagName === "metadata" && decoded.get("id") === "lineage-logo-edit")
    || /(?:^|\s)svg_select(?:_|\s|$)/u.test(decoded.get("class") ?? "")) {
    throw new Error("Accepted artifact contains editor metadata.");
  }
  return xlinkDeclared;
}

export function validateStrictCleanSvg(svg) {
  if (typeof svg !== "string" || svg.length === 0 || Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error("Accepted artifact SVG is empty or too large.");
  validateXmlCharacters(svg);
  let cursor = svg.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (svg.startsWith("<?xml", cursor)) {
    const declaration = /^<\?xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*\?>/u.exec(svg.slice(cursor));
    if (!declaration) throw new Error("Accepted artifact XML declaration is invalid.");
    const encoding = /\sencoding=(['"])([^'"]+)\1/u.exec(declaration[0])?.[2];
    if (encoding && encoding.toLowerCase() !== "utf-8") throw new Error("Accepted artifact XML encoding must be UTF-8.");
    cursor += declaration[0].length;
  }
  const stack = [];
  let rootSeen = false;
  let rootClosed = false;
  while (cursor < svg.length) {
    if (svg.startsWith("<!--", cursor)) {
      const end = svg.indexOf("-->", cursor + 4);
      if (end < 0 || svg.slice(cursor + 4, end).includes("--")) throw new Error("Accepted artifact comment is malformed.");
      cursor = end + 3;
      continue;
    }
    if (svg[cursor] !== "<") {
      const end = svg.indexOf("<", cursor);
      const text = svg.slice(cursor, end < 0 ? svg.length : end);
      if ((stack.length === 0 && text.trim()) || text.includes("]]>") ) throw new Error("Accepted artifact must contain exactly one standalone SVG root.");
      decodeXmlValue(text);
      cursor = end < 0 ? svg.length : end;
      continue;
    }
    if (svg.startsWith("<?", cursor) || svg.startsWith("<!", cursor)) throw new Error("Accepted artifact declarations and processing instructions are not allowed.");
    if (svg.startsWith("</", cursor)) {
      const closing = /^<\/([A-Za-z_][A-Za-z0-9_.-]*)\s*>/u.exec(svg.slice(cursor));
      if (!closing || stack.at(-1)?.name !== closing[1]) throw new Error("Accepted artifact closing tag is malformed.");
      stack.pop();
      cursor += closing[0].length;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    let quote = "";
    let end = cursor + 1;
    for (; end < svg.length; end += 1) {
      const character = svg[end];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= svg.length || quote) throw new Error("Accepted artifact opening tag is malformed.");
    let inside = svg.slice(cursor + 1, end);
    const selfClosing = /\/\s*$/u.test(inside);
    if (selfClosing) inside = inside.replace(/\/\s*$/u, "");
    const tag = /^([A-Za-z_][A-Za-z0-9_.-]*)/u.exec(inside);
    if (!tag || rootClosed) throw new Error("Accepted artifact must contain exactly one standalone SVG root.");
    const tagName = tag[1];
    if ((!rootSeen && tagName !== "svg") || ACTIVE_SVG_ELEMENTS.has(tagName) || tagName.startsWith("animate")) {
      throw new Error("Accepted artifact contains an invalid root or active element.");
    }
    const attributes = new Map();
    let rest = inside.slice(tag[0].length);
    while (rest.length > 0) {
      const attribute = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])([\s\S]*?)\2/u.exec(rest);
      if (!attribute || attributes.has(attribute[1])) throw new Error("Accepted artifact attribute syntax is malformed.");
      attributes.set(attribute[1], attribute[3]);
      rest = rest.slice(attribute[0].length);
    }
    if (!rootSeen && attributes.get("xmlns") !== "http://www.w3.org/2000/svg") {
      throw new Error("Accepted artifact root must declare the SVG namespace.");
    }
    const xlinkDeclared = validateSvgAttributes(tagName, attributes, stack.at(-1)?.xlinkDeclared ?? false);
    rootSeen = true;
    if (!selfClosing) stack.push({ name: tagName, xlinkDeclared });
    else if (stack.length === 0) rootClosed = true;
    cursor = end + 1;
  }
  if (!rootSeen || !rootClosed || stack.length !== 0) throw new Error("Accepted artifact is incomplete or has no standalone SVG root.");
}
