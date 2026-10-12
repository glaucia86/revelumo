import { DOMImplementation, DOMParser, XMLSerializer, type Element, type Node } from '@xmldom/xmldom';

export const XMP_HEADER = Buffer.from('http://ns.adobe.com/xap/1.0/\0');
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DC = 'http://purl.org/dc/elements/1.1/';
const XML = 'http://www.w3.org/XML/1998/namespace';

// Source nodes never enter the output document. Only selected text is recreated.
export function rebuildXmpCredits(payload: Buffer): Buffer | null {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(XMP_HEADER.length));
  if (xml.split('<').length > 2048) throw new Error('XMP XML exceeds the supported node budget');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD and entity declarations are unsupported');
  const source = new DOMParser({ onError: () => { throw new Error('Malformed XMP XML'); } }).parseFromString(xml, 'application/xml');
  const pending: Array<{ node: Node; depth: number }> = [{ node: source, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 32) throw new Error('XMP XML exceeds the supported nesting limit');
    for (const child of Array.from(node.childNodes)) pending.push({ node: child, depth: depth + 1 });
  }
  const rdfRoots = source.getElementsByTagNameNS(RDF, 'RDF');
  const root = source.documentElement;
  if (rdfRoots.length !== 1 || !(rdfRoots[0] === root || (rdfRoots[0].parentNode === root && root?.namespaceURI === 'adobe:ns:meta/' && root.localName === 'xmpmeta'))) {
    throw new Error('Unsupported XMP document structure');
  }
  const creditNames = new Set(['author', 'authors', 'photographer', 'imageeditor', 'contributor', 'creator', 'rights', 'artist', 'copyright', 'copyrightnotice', 'owner', 'credit', 'usageterms', 'webstatement', 'imagecreator', 'copyrightowner']);
  for (const element of Array.from(source.getElementsByTagName('*'))) {
    if (creditNames.has((element.localName ?? '').toLowerCase()) && !(element.namespaceURI === DC && ['creator', 'rights'].includes(element.localName ?? ''))) {
      throw new Error('An alternative XMP credit property needs a supported adapter');
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && creditNames.has((attribute.localName ?? '').toLowerCase())) throw new Error('Attribute-form XMP credits need a supported adapter');
    }
  }
  const creatorFields = source.getElementsByTagNameNS(DC, 'creator');
  const rightsFields = source.getElementsByTagNameNS(DC, 'rights');
  if (creatorFields.length > 1 || rightsFields.length > 1) throw new Error('Duplicate XMP credit fields are ambiguous');
  const elementChildren = (node: Node) => Array.from(node.childNodes).filter(child => child.nodeType === 1) as Element[];
  const listItems = (field: Element, kind: string) => {
    if (field.parentNode?.namespaceURI !== RDF || field.parentNode?.localName !== 'Description' || field.parentNode?.parentNode !== rdfRoots[0]) throw new Error('Nested XMP credit property');
    const description = field.parentNode as Element;
    if (Array.from(description.attributes).some(attribute => attribute.namespaceURI === RDF && attribute.localName !== 'about') || (description.getAttributeNS(RDF, 'about') ?? '') !== '') {
      throw new Error('XMP credits identify a different or unsupported RDF subject');
    }
    for (let ancestor: Node | null = description; ancestor?.nodeType === 1; ancestor = ancestor.parentNode) {
      const element = ancestor as Element;
      if (element.hasAttributeNS(XML, 'base') || element.hasAttributeNS(XML, 'lang')) {
        throw new Error('Inherited XML base or language needs a supported credit adapter');
      }
    }
    const rejectMixedText = (node: Element) => {
      if (Array.from(node.childNodes).some(child => child.nodeType !== 1 && (child.textContent ?? '').trim() !== '')) {
        throw new Error('Mixed text in XMP credit containers is unsupported');
      }
    };
    rejectMixedText(field);
    const meaningfulAttributes = (node: Element) => Array.from(node.attributes).filter(attribute => attribute.namespaceURI !== 'http://www.w3.org/2000/xmlns/');
    if (meaningfulAttributes(field).length) throw new Error('Qualified XMP credit fields are unsupported');
    const lists = elementChildren(field);
    if (lists.length !== 1 || lists[0].namespaceURI !== RDF || lists[0].localName !== kind) throw new Error('Unsupported XMP credit structure');
    if (meaningfulAttributes(lists[0]).length) throw new Error('Qualified XMP credit containers are unsupported');
    rejectMixedText(lists[0]);
    const items = elementChildren(lists[0]);
    for (const item of items) {
      if (meaningfulAttributes(item).some(attribute => !(kind === 'Alt' && attribute.namespaceURI === XML && attribute.localName === 'lang'))) {
        throw new Error('Qualified XMP credit values are unsupported');
      }
    }
    if (items.length === 0 || items.some(item => item.namespaceURI !== RDF || item.localName !== 'li' || elementChildren(item).length !== 0)) {
      throw new Error('Structured XMP credit values are unsupported');
    }
    return items;
  };
  const creators = creatorFields.length ? listItems(creatorFields[0], 'Seq').map(node => node.textContent ?? '') : [];
  const rights = rightsFields.length ? listItems(rightsFields[0], 'Alt').map(node => {
    const language = node.getAttributeNS(XML, 'lang');
    if (!language || !language.trim()) throw new Error('XMP copyright alternatives require an explicit language');
    return { language, value: node.textContent ?? '' };
  }) : [];
  if (new Set(rights.map(item => item.language.toLowerCase())).size !== rights.length) throw new Error('Duplicate XMP copyright languages are ambiguous');
  if (creators.length === 0 && rights.length === 0) return null;

  const output = new DOMImplementation().createDocument('adobe:ns:meta/', 'x:xmpmeta', null);
  const rdf = output.createElementNS(RDF, 'rdf:RDF');
  output.documentElement!.appendChild(rdf);
  const description = output.createElementNS(RDF, 'rdf:Description');
  rdf.appendChild(description);
  if (creators.length) {
    const creator = output.createElementNS(DC, 'dc:creator');
    const sequence = output.createElementNS(RDF, 'rdf:Seq');
    description.appendChild(creator); creator.appendChild(sequence);
    for (const value of creators) {
      const item = output.createElementNS(RDF, 'rdf:li');
      item.appendChild(output.createTextNode(value)); sequence.appendChild(item);
    }
  }
  if (rights.length) {
    const property = output.createElementNS(DC, 'dc:rights');
    const alternatives = output.createElementNS(RDF, 'rdf:Alt');
    description.appendChild(property); property.appendChild(alternatives);
    for (const { language, value } of rights) {
      const item = output.createElementNS(RDF, 'rdf:li');
      item.setAttributeNS(XML, 'xml:lang', language);
      item.appendChild(output.createTextNode(value)); alternatives.appendChild(item);
    }
  }
  const text = new XMLSerializer().serializeToString(output, { requireWellFormed: true });
  const bytes = Buffer.concat([XMP_HEADER, Buffer.from(text, 'utf8')]);
  if (bytes.length + 2 > 0xffff) throw new Error('Rebuilt XMP exceeds a JPEG segment');
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(bytes.length + 2, 2);
  return Buffer.concat([header, bytes]);
}
