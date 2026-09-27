import { crc32 } from 'node:zlib';
import { makePng } from './png';

/** A zip with every file stored as is, which is all a .docx needs. */
function zip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = Object.keys(files).length;
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const text = (value: string) =>
  `<w:p><w:r><w:t xml:space="preserve">${value.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`;
const cell = (value: string) => `<w:tc>${text(value)}</w:tc>`;

const picture = `<w:p><w:r><w:drawing>
  <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
    <wp:extent cx="1905000" cy="952500"/>
    <wp:docPr id="1" name="Logo" descr="Company logo"/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr><pic:cNvPr id="1" name="logo.png" descr="Company logo"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill>
          <pic:spPr/>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing></w:r></w:p>`;

/**
 * A small Word letter for tests (no binary fixtures in the repo): a picture,
 * mail-merge style placeholders and a two-column table.
 */
export function makeDocx(): Buffer {
  const body = [
    picture,
    text('Dear «First Name»,'),
    text('Invoice {{Invoice No}} is due.'),
    `<w:tbl><w:tr>${cell('Item')}${cell('Price')}</w:tr><w:tr>${cell('Tulips')}${cell('3')}</w:tr></w:tbl>`,
    text('Kind regards'),
  ].join('');
  return zip({
    '[Content_Types].xml': Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    '_rels/.rels': Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/document.xml': Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rIdLogo" Type="${R}/image" Target="media/logo.png"/></Relationships>`,
    ),
    'word/media/logo.png': makePng(200, 100, [47, 93, 140]),
  });
}
