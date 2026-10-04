/**
 * formats/dxf/writer/dxf-section-writer.js
 *
 * Section serializers for HEADER, TABLES, BLOCKS, ENTITIES, and preserved raw sections.
 */

import { pushTag, fmtNum } from './entity-writers/writer-utils.js';
import { writeEntity } from './entity-writers/index.js';

export function writeHeaderSection(doc, lines) {
  pushTag(lines, 0, 'SECTION');
  pushTag(lines, 2, 'HEADER');

  for (const [varName, varVal] of doc.header.entries()) {
    pushTag(lines, 9, varName);

    if (varName === '$HANDSEED') {
      // Always emit latest handseed from allocator
      pushTag(lines, 5, doc.handles.handseed);
      continue;
    }

    if (Array.isArray(varVal)) {
      for (const t of varVal) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      // Single value
      let code = 1;
      if (typeof varVal === 'number') code = Number.isInteger(varVal) ? 70 : 40;
      pushTag(lines, code, varVal);
    }
  }

  // Ensure $HANDSEED is written if not present in original header map
  if (!doc.header.has('$HANDSEED')) {
    pushTag(lines, 9, '$HANDSEED');
    pushTag(lines, 5, doc.handles.handseed);
  }

  pushTag(lines, 0, 'ENDSEC');
}

export function writeTablesSection(doc, lines) {
  // Collect all tables that have records or source tags
  const tableEntries = [
    { name: 'VPORT', table: doc.tables.viewPorts },
    { name: 'LTYPE', table: doc.tables.lineTypes },
    { name: 'LAYER', table: doc.tables.layers, isLayerMap: true },
    { name: 'STYLE', table: doc.tables.textStyles },
    { name: 'UCS', table: doc.tables.ucs },
    { name: 'APPID', table: doc.tables.appIds },
    { name: 'DIMSTYLE', table: doc.tables.dimStyles },
    { name: 'BLOCK_RECORD', table: doc.tables.blockRecords },
  ];

  // Add any other custom tables
  for (const [name, table] of doc.tables.other.entries()) {
    tableEntries.push({ name, table });
  }

  // Only emit TABLES section if there are tables
  const hasTables = tableEntries.some((e) => (
    e.isLayerMap
      ? e.table.size > 0
      : (e.table?.records?.size > 0 || e.table?.source?.headerRawTags?.length > 0)
  ));

  if (!hasTables) return;

  pushTag(lines, 0, 'SECTION');
  pushTag(lines, 2, 'TABLES');

  for (const entry of tableEntries) {
    if (entry.isLayerMap) {
      writeLayerTable(doc, lines);
    } else if (entry.table) {
      writeGenericTable(entry.name, entry.table, lines);
    }
  }

  pushTag(lines, 0, 'ENDSEC');
}

function writeLayerTable(doc, lines) {
  const layerMap = doc.tables.layers;
  if (!layerMap || layerMap.size === 0) return;

  pushTag(lines, 0, 'TABLE');
  pushTag(lines, 2, 'LAYER');
  pushTag(lines, 70, layerMap.size);

  for (const layer of layerMap.values()) {
    if (layer.source?.rawTags && layer.source.rawTags.length > 0) {
      for (const t of layer.source.rawTags) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      pushTag(lines, 0, 'LAYER');
      if (layer.handle) pushTag(lines, 5, layer.handle);
      if (layer.ownerHandle) pushTag(lines, 330, layer.ownerHandle);
      pushTag(lines, 2, layer.name);
      pushTag(lines, 70, layer.flags || 0);

      const col = layer.off ? -Math.abs(layer.colorIndex) : layer.colorIndex;
      pushTag(lines, 62, col);
      pushTag(lines, 6, layer.lineType || 'CONTINUOUS');
      if (layer.trueColor != null) pushTag(lines, 420, layer.trueColor);
      if (layer.lineWeight != null && layer.lineWeight !== -3) pushTag(lines, 370, layer.lineWeight);
    }
  }

  pushTag(lines, 0, 'ENDTAB');
}

function writeGenericTable(tableName, table, lines) {
  if (!table) return;
  const recordCount = table.records?.size || 0;
  if (recordCount === 0 && (!table.source?.headerRawTags || table.source.headerRawTags.length === 0)) {
    return;
  }

  if (table.source?.headerRawTags && table.source.headerRawTags.length > 0) {
    for (const t of table.source.headerRawTags) {
      pushTag(lines, t.code, t.value);
    }
  } else {
    pushTag(lines, 0, 'TABLE');
    pushTag(lines, 2, tableName);
    pushTag(lines, 70, recordCount);
  }

  if (table.records) {
    for (const record of table.records.values()) {
      if (record.source?.rawTags && record.source.rawTags.length > 0) {
        for (const t of record.source.rawTags) {
          pushTag(lines, t.code, t.value);
        }
      } else {
        pushTag(lines, 0, tableName);
        if (record.handle) pushTag(lines, 5, record.handle);
        if (record.ownerHandle) pushTag(lines, 330, record.ownerHandle);
        pushTag(lines, 2, record.name);
        pushTag(lines, 70, 0);
      }
    }
  }

  if (table.source?.endTabRawTags && table.source.endTabRawTags.length > 0) {
    for (const t of table.source.endTabRawTags) {
      pushTag(lines, t.code, t.value);
    }
  } else {
    pushTag(lines, 0, 'ENDTAB');
  }
}

export function writeBlocksSection(doc, lines) {
  if (!doc.blocks || doc.blocks.size === 0) return;

  pushTag(lines, 0, 'SECTION');
  pushTag(lines, 2, 'BLOCKS');

  for (const block of doc.blocks.values()) {
    if (block.source?.headerRawTags && block.source.headerRawTags.length > 0) {
      for (const t of block.source.headerRawTags) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      pushTag(lines, 0, 'BLOCK');
      if (block.handle) pushTag(lines, 5, block.handle);
      if (block.ownerHandle) pushTag(lines, 330, block.ownerHandle);
      pushTag(lines, 8, block.layerId || '0');
      pushTag(lines, 2, block.name);
      pushTag(lines, 70, block.flags || 0);
      pushTag(lines, 10, fmtNum(block.basePoint?.x || 0));
      pushTag(lines, 20, fmtNum(block.basePoint?.y || 0));
      pushTag(lines, 30, fmtNum(block.basePoint?.z || 0));
    }

    // Write block nested entities
    for (const ent of block.entities) {
      if (!ent.state?.deleted) {
        writeEntity(ent, lines);
      }
    }

    if (block.source?.endBlkRawTags && block.source.endBlkRawTags.length > 0) {
      for (const t of block.source.endBlkRawTags) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      pushTag(lines, 0, 'ENDBLK');
      pushTag(lines, 8, block.layerId || '0');
    }
  }

  pushTag(lines, 0, 'ENDSEC');
}

export function writeEntitiesSection(doc, lines) {
  pushTag(lines, 0, 'SECTION');
  pushTag(lines, 2, 'ENTITIES');

  for (const entity of doc.entities) {
    if (!entity.state?.deleted) {
      writeEntity(entity, lines);
    }
  }

  pushTag(lines, 0, 'ENDSEC');
}

export function writeRawSection(rawTokens, lines) {
  for (const t of rawTokens) {
    pushTag(lines, t.code, t.value);
  }
}
