/**
 * formats/dxf/parser/dxf-section-parser.js
 *
 * Section parsers for HEADER, TABLES, BLOCKS, ENTITIES, and OBJECTS.
 */

import { DxfLayer } from '../model/dxf-layer.js';
import { DxfBlock } from '../model/dxf-block.js';
import { DxfTable, DxfTableRecord } from '../model/dxf-table.js';
import { decodeEntity } from './entity-codecs/index.js';

export function parseHeaderSection(stream, doc) {
  let currentVar = null;
  const currentTags = [];

  while (stream.hasNext()) {
    const token = stream.peek();
    if (token.code === 0) {
      if (token.value === 'ENDSEC') {
        stream.next();
        break;
      }
    }

    stream.next();

    if (token.code === 9) {
      // Commit previous var if any
      if (currentVar) {
        doc.header.set(currentVar, currentTags.length === 1 ? currentTags[0].value : [...currentTags]);
      }
      currentVar = token.value.trim();
      currentTags.length = 0;
    } else if (currentVar) {
      currentTags.push(token);

      // Fast check for critical units / version vars
      if (currentVar === '$ACADVER' && token.code === 1) {
        doc.source.acadVersion = token.value.trim();
      } else if (currentVar === '$INSUNITS' && token.code === 70) {
        doc.units.insunits = parseInt(token.value, 10);
      } else if (currentVar === '$MEASUREMENT' && token.code === 70) {
        doc.units.measurement = parseInt(token.value, 10);
      } else if (currentVar === '$HANDSEED' && (token.code === 5 || token.code === 105)) {
        doc.handles.setSeed(token.value);
      }
    }
  }

  if (currentVar) {
    doc.header.set(currentVar, currentTags.length === 1 ? currentTags[0].value : [...currentTags]);
  }
}

export function parseTablesSection(stream, doc) {
  while (stream.hasNext()) {
    const token = stream.peek();
    if (token.code === 0) {
      if (token.value === 'ENDSEC') {
        stream.next();
        break;
      }
      if (token.value === 'TABLE') {
        parseSingleTable(stream, doc);
        continue;
      }
    }
    stream.next();
  }
}

function getTableInstance(doc, tableName) {
  const upper = tableName.toUpperCase();
  switch (upper) {
    case 'LTYPE': return doc.tables.lineTypes;
    case 'STYLE': return doc.tables.textStyles;
    case 'DIMSTYLE': return doc.tables.dimStyles;
    case 'APPID': return doc.tables.appIds;
    case 'BLOCK_RECORD': return doc.tables.blockRecords;
    case 'VPORT': return doc.tables.viewPorts;
    case 'UCS': return doc.tables.ucs;
    default: {
      if (!doc.tables.other.has(upper)) {
        doc.tables.other.set(upper, new DxfTable(upper));
      }
      return doc.tables.other.get(upper);
    }
  }
}

function parseSingleTable(stream, doc) {
  stream.next(); // consume 0 TABLE
  let tableName = 'UNKNOWN';
  const headerTags = [{ code: 0, value: 'TABLE' }];

  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 2) {
      tableName = t.value.trim().toUpperCase();
      headerTags.push(stream.next());
      break;
    }
    if (t.code === 0) break;
    headerTags.push(stream.next());
  }

  // Read table header tags until first record (0 <RECORD_TYPE>) or 0 ENDTAB
  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) break;
    headerTags.push(stream.next());
  }

  const tableInstance = getTableInstance(doc, tableName);
  tableInstance.source.headerRawTags = headerTags;

  // Read table records
  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) {
      if (t.value === 'ENDTAB') {
        tableInstance.source.endTabRawTags = [stream.next()];
        break;
      }
      parseTableRecord(stream, tableName, doc, tableInstance);
      continue;
    }
    stream.next();
  }
}

function parseTableRecord(stream, tableName, doc, tableInstance) {
  const recordTypeToken = stream.next(); // e.g. 0 LAYER
  const recordType = recordTypeToken.value.trim().toUpperCase();
  const tags = [recordTypeToken];
  let recordName = '';
  let handle = null;
  let ownerHandle = null;
  let colorIndex = 7;
  let trueColor = null;
  let lineType = 'CONTINUOUS';
  let lineWeight = -3;
  let flags = 0;

  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) break; // Next record or ENDTAB
    const cur = stream.next();
    tags.push(cur);

    switch (cur.code) {
      case 2: recordName = cur.value.trim(); break;
      case 5:
      case 105:
        handle = cur.value.trim().toUpperCase();
        doc.handles.register(handle);
        break;
      case 330: ownerHandle = cur.value.trim().toUpperCase(); break;
      case 62: colorIndex = parseInt(cur.value, 10); break;
      case 420: trueColor = parseInt(cur.value, 10); break;
      case 6: lineType = cur.value.trim(); break;
      case 370: lineWeight = parseInt(cur.value, 10); break;
      case 70: flags = parseInt(cur.value, 10); break;
    }
  }

  if (recordType === 'LAYER') {
    const layer = new DxfLayer({
      name: recordName || '0',
      handle,
      ownerHandle,
      colorIndex,
      trueColor,
      lineType,
      lineWeight,
      flags,
      source: { rawTags: tags },
    });
    doc.addLayer(layer);
  } else {
    const rec = new DxfTableRecord(recordName, {
      handle,
      ownerHandle,
      source: { rawTags: tags },
    });
    tableInstance.addRecord(recordName, rec);
  }
}

export function parseBlocksSection(stream, doc) {
  while (stream.hasNext()) {
    const token = stream.peek();
    if (token.code === 0) {
      if (token.value === 'ENDSEC') {
        stream.next();
        break;
      }
      if (token.value === 'BLOCK') {
        parseSingleBlock(stream, doc);
        continue;
      }
    }
    stream.next();
  }
}

function parseSingleBlock(stream, doc) {
  const blockToken = stream.next(); // 0 BLOCK
  const headerTags = [blockToken];
  let blockName = '*UNNAMED';
  let handle = null;
  let ownerHandle = null;
  let layerId = '0';
  let bx = 0, by = 0, bz = 0;
  let flags = 0;

  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) break;
    const cur = stream.next();
    headerTags.push(cur);

    switch (cur.code) {
      case 2: blockName = cur.value.trim(); break;
      case 5:
      case 105:
        handle = cur.value.trim().toUpperCase();
        doc.handles.register(handle);
        break;
      case 330: ownerHandle = cur.value.trim().toUpperCase(); break;
      case 8: layerId = cur.value.trim(); break;
      case 10: bx = parseFloat(cur.value) || 0; break;
      case 20: by = parseFloat(cur.value) || 0; break;
      case 30: bz = parseFloat(cur.value) || 0; break;
      case 70: flags = parseInt(cur.value, 10); break;
    }
  }

  const block = new DxfBlock({
    name: blockName,
    handle,
    ownerHandle,
    layerId,
    basePoint: { x: bx, y: by, z: bz },
    flags,
    source: { headerRawTags: headerTags },
  });

  // Parse nested entities until 0 ENDBLK
  let order = 0;
  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) {
      if (t.value === 'ENDBLK') {
        const endTags = [stream.next()];
        while (stream.hasNext() && stream.peek().code !== 0) {
          endTags.push(stream.next());
        }
        block.source.endBlkRawTags = endTags;
        break;
      }
      const entity = parseEntityRecord(stream, order++, doc);
      if (entity) block.addEntity(entity);
      continue;
    }
    stream.next();
  }

  doc.addBlock(block);
}

export function parseEntitiesSection(stream, doc) {
  let order = 0;
  while (stream.hasNext()) {
    const token = stream.peek();
    if (token.code === 0) {
      if (token.value === 'ENDSEC') {
        stream.next();
        break;
      }
      const entity = parseEntityRecord(stream, order++, doc);
      if (entity) doc.addEntity(entity);
      continue;
    }
    stream.next();
  }
}

function parseEntityRecord(stream, order, doc) {
  const typeToken = stream.next(); // 0 <TYPE>
  const type = typeToken.value.trim().toUpperCase();
  const tags = [typeToken];

  while (stream.hasNext()) {
    const t = stream.peek();
    if (t.code === 0) break; // Start of next entity or ENDSEC
    tags.push(stream.next());
  }

  // Handle compound entities: POLYLINE (with VERTEX) and INSERT (with ATTRIB when code 66 == 1)
  const subEntities = [];
  let seqendTags = null;

  if (type === 'POLYLINE') {
    while (stream.hasNext()) {
      const t = stream.peek();
      if (t.code === 0) {
        if (t.value === 'SEQEND') {
          seqendTags = [stream.next()];
          while (stream.hasNext() && stream.peek().code !== 0) {
            seqendTags.push(stream.next());
          }
          for (const sTag of seqendTags) {
            if (sTag.code === 5 || sTag.code === 105) {
              doc.handles.register(sTag.value);
            }
          }
          break;
        }
        if (t.value === 'VERTEX') {
          const v = parseEntityRecord(stream, order, doc);
          if (v) subEntities.push(v);
          continue;
        }
        break;
      }
      stream.next();
    }
  } else if (type === 'INSERT') {
    const hasAttributesFollow = tags.some((t) => t.code === 66 && parseInt(t.value, 10) === 1);
    if (hasAttributesFollow) {
      while (stream.hasNext()) {
        const t = stream.peek();
        if (t.code === 0) {
          if (t.value === 'SEQEND') {
            seqendTags = [stream.next()];
            while (stream.hasNext() && stream.peek().code !== 0) {
              seqendTags.push(stream.next());
            }
            for (const sTag of seqendTags) {
              if (sTag.code === 5 || sTag.code === 105) {
                doc.handles.register(sTag.value);
              }
            }
            break;
          }
          if (t.value === 'ATTRIB') {
            const a = parseEntityRecord(stream, order, doc);
            if (a) subEntities.push(a);
            continue;
          }
          break;
        }
        stream.next();
      }
    }
  }

  const entity = decodeEntity(type, tags, order, subEntities);
  if (seqendTags) {
    entity.source.seqendRawTags = seqendTags;
  }
  if (entity.handle) {
    doc.handles.register(entity.handle);
  }
  return entity;
}
