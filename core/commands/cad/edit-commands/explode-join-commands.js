import {addGenerated} from './generated-entity.js';
/**
 * core/commands/cad/edit-commands/explode-join-commands.js
 *
 * Native CAD Explode and Join Commands.
 * - ExplodeCommand: Explodes INSERT block instances into constituent model space entities,
 *   and polylines into individual LINE / ARC entities.
 * - JoinCommand: Joins connected LINEs and ARCs into a single continuous LWPOLYLINE.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 * Native source tokens are retained for reversible Save overlays.
 */

import { CadCommand } from '../cad-command.js';
import { ChangeSet, snapshotEntityState, restoreEntityState, cloneNativeValue } from '../change-set.js';
import { DxfEntity } from '../../../../formats/dxf/model/dxf-entity.js';
import { pointDistance, normalizeAngle, bulgeToArc } from '../../../geometry/cad-intersections.js';
import {resolveEntityStyle} from '../../../../formats/dxf/render/dxf-style-resolver.js';
import { createInsertTransform, transformPoint } from '../../../../formats/dxf/render/dxf-block-renderer.js';

const EPSILON = 1e-3;

/**
 * Explode compound entities (INSERT block references, LWPOLYLINEs) into constituent primitives.
 */
export class ExplodeCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   */
  constructor(entityIds) {
    super({ name: 'EXPLODE', description: `Explode ${entityIds.length} entities` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];

    this.removedEntities = []; // Array<{ entity, index, snapshot }>
    this.createdEntities = []; // Array<DxfEntity>
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    this.removedEntities = [];
    this.createdEntities = [];
    const originalPositions=new Map(document.entities.map((e,i)=>[e.id,i]));

    for (const id of this.entityIds) {
      const entity = document.getEntity(id);
      if (!entity) continue;

      const type = String(entity.type).toUpperCase();

      if (type === 'INSERT') {
        const blockName = entity.attributes?.blockName;
        const block = document.getBlock(blockName);
        if (!block) continue;

        const snap = snapshotEntityState(entity);
        const res = document.removeEntity(entity);
        if (res) {
          this.removedEntities.push({ entity: res.entity, index: originalPositions.get(res.entity.id), snapshot: snap });
          changeSet.addDeleted(res.entity, res.index);
        }

        const transform = createInsertTransform(
          entity.geometry?.insertionPoint,
          entity.geometry?.scale,
          entity.geometry?.rotation
        );
        const basePoint = block.basePoint || { x: 0, y: 0, z: 0 };

        for (const child of block.entities) {
          if (child.state?.deleted) continue;

          // Determine exploded layer & color inheritance
          const isLayer0 = String(child.layerId || '0').trim() === '0';
          const layerId = isLayer0 ? entity.layerId : child.layerId;

          const childStyle = cloneNativeValue(child.style || {});
          const inherited=resolveEntityStyle(entity,document);
          if (childStyle.colorMode === 'BYBLOCK' || childStyle.colorIndex===0) {
            childStyle.colorMode = 'INDEXED';
            childStyle.colorIndex = inherited.colorIndex || 7;
            childStyle.trueColor = inherited.colorSource==='TRUECOLOR' ? inherited.color : null;
          }

          if(childStyle.lineType==='BYBLOCK'){childStyle.lineType=inherited.lineType;childStyle.lineTypeMode='EXPLICIT';}
          if(childStyle.lineWeight===-2){childStyle.lineWeight=Math.round(inherited.lineWeight*100);childStyle.lineWeightMode='EXPLICIT';}
          // Transform child geometry
          const childGeom = cloneNativeValue(child.geometry || {});
          if (childGeom.start) childGeom.start = transformPoint(childGeom.start, transform, basePoint);
          if (childGeom.end) childGeom.end = transformPoint(childGeom.end, transform, basePoint);
          if (childGeom.center) childGeom.center = transformPoint(childGeom.center, transform, basePoint);
          if (childGeom.point) childGeom.point = transformPoint(childGeom.point, transform, basePoint);
          if (childGeom.insertionPoint) childGeom.insertionPoint = transformPoint(childGeom.insertionPoint, transform, basePoint);

          if (childGeom.radius != null) {
            const avgScale = (Math.abs(transform.scale.x) + Math.abs(transform.scale.y)) / 2;
            childGeom.radius *= avgScale;
          }

          if (child.type === 'ARC') {
            childGeom.startAngle = normalizeAngle((childGeom.startAngle || 0) + transform.rotationDeg);
            childGeom.endAngle = normalizeAngle((childGeom.endAngle || 0) + transform.rotationDeg);
          }

          if (Array.isArray(childGeom.vertices)) {
            childGeom.vertices = childGeom.vertices.map((v) => {
              const tp = transformPoint(v, transform, basePoint);
              if (v.bulge != null) tp.bulge = v.bulge;
              if(v.startWidth!=null)tp.startWidth=v.startWidth*transform.scale.x;
              if(v.endWidth!=null)tp.endWidth=v.endWidth*transform.scale.x;
              return tp;
            });
          }

          if(childGeom.constantWidth!=null)childGeom.constantWidth*=transform.scale.x;
          if(childGeom.elevation!=null)childGeom.elevation=(entity.geometry.insertionPoint.z ?? 0)+(childGeom.elevation-(basePoint.z ?? 0))*transform.scale.z;
          const explodedChild = new DxfEntity({
            type: child.type,
            layerId,
            space: entity.space,
            style: childStyle,
            geometry: childGeom,
            attributes: cloneNativeValue(child.attributes || {}),
            state: { modified: true, generated: true },
          });

          

          explodedChild.ownerHandle=entity.ownerHandle;explodedChild.layoutId=entity.layoutId;explodedChild.source.copiedRawTags=child.source.rawTags.slice();
          addGenerated(document,explodedChild);
          this.createdEntities.push(explodedChild);
          changeSet.addAdded(explodedChild);
        }
      } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
        const vertices = entity.geometry?.vertices || [];
        if (vertices.length < 2) continue;

        const snap = snapshotEntityState(entity);
        const res = document.removeEntity(entity);
        if (res) {
          this.removedEntities.push({ entity: res.entity, index: originalPositions.get(res.entity.id), snapshot: snap });
          changeSet.addDeleted(res.entity, res.index);
        }

        const count = entity.geometry?.closed ? vertices.length : vertices.length - 1;

        for (let i = 0; i < count; i++) {
          const v1 = vertices[i];
          const v2 = vertices[(i + 1) % vertices.length];
          const bulge = v1.bulge || 0;

          if (Math.abs(bulge) < 1e-6) {
            // Explode into straight LINE
            const line = new DxfEntity({
              type: 'LINE',
              layerId: entity.layerId,
              space: entity.space,
              style: cloneNativeValue(entity.style || {}),
              geometry: {
                start: { x: v1.x, y: v1.y, z: entity.geometry.elevation ?? v1.z ?? 0 },
                end: { x: v2.x, y: v2.y, z: entity.geometry.elevation ?? v2.z ?? 0 },
              },
              state: { modified: true, generated: true },
            });
            
            addGenerated(document,line);
            this.createdEntities.push(line);
            changeSet.addAdded(line);
          } else {
            // Explode into ARC using the authoritative bulgeToArc helper
            const arcGeom = bulgeToArc(v1, v2, bulge);
            if (arcGeom) {
              const arc = new DxfEntity({
                type: 'ARC',
                layerId: entity.layerId,
                space: entity.space,
                style: cloneNativeValue(entity.style || {}),
                geometry: {
                  center: {...arcGeom.center,z:entity.geometry.elevation ?? v1.z ?? 0},
                  radius: arcGeom.radius,
                  startAngle: arcGeom.startAngle,
                  endAngle: arcGeom.endAngle,
                },
                state: { modified: true, generated: true },
              });
              
              addGenerated(document,arc);
              this.createdEntities.push(arc);
              changeSet.addAdded(arc);
            }
          }
        }
      }
    }

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    // Remove all exploded children
    for (const child of this.createdEntities) {
      const res = document.removeEntity(child.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
    }

    // Restore original compound entities in original order
    this.removedEntities.sort((a, b) => a.index - b.index);
    for (const rec of this.removedEntities) {
      restoreEntityState(rec.entity, rec.snapshot, document);
      document.addEntity(rec.entity, rec.index);
      changeSet.addAdded(rec.entity);
    }

    this.executed = false;
    return changeSet;
  }
}

/**
 * Join contiguous LINEs and ARCs into a single continuous LWPOLYLINE.
 */
export class JoinCommand extends CadCommand {
  /**
   * @param {Array<string>} entityIds
   */
  constructor(entityIds) {
    super({ name: 'JOIN', description: `Join ${entityIds.length} entities into polyline` });
    this.entityIds = Array.isArray(entityIds) ? entityIds : [entityIds];

    this.removedEntities = [];
    this.createdPolyline = null;
  }

  execute(document) {
    this.validate(document);
    const changeSet = new ChangeSet(this.name);
    const entities = this.entityIds
      .map((id) => document.getEntity(id))
      .filter((e) => e && (e.type === 'LINE' || e.type === 'ARC'));

    if (entities.length < 2) return changeSet;

    // Convert entities into orientable segments
    const remaining = entities.map((ent) => {
      if (ent.type === 'LINE') {
        return {
          entity: ent,
          type: 'LINE',
          p1: { x: ent.geometry.start.x, y: ent.geometry.start.y },
          p2: { x: ent.geometry.end.x, y: ent.geometry.end.y },
          bulge: 0,
        };
      }
      // ARC
      const c = ent.geometry.center;
      const r = ent.geometry.radius;
      const sRad = (ent.geometry.startAngle * Math.PI) / 180;
      const eRad = (ent.geometry.endAngle * Math.PI) / 180;
      const p1 = { x: c.x + r * Math.cos(sRad), y: c.y + r * Math.sin(sRad) };
      const p2 = { x: c.x + r * Math.cos(eRad), y: c.y + r * Math.sin(eRad) };
      const sweep = normalizeAngle(ent.geometry.endAngle - ent.geometry.startAngle);
      const bulge = Math.tan(((sweep * Math.PI) / 180) / 4);

      return {
        entity: ent,
        type: 'ARC',
        p1,
        p2,
        bulge,
      };
    });

    // Every endpoint has degree at most two; a branch cannot become one native polyline.
    for(const seg of remaining)for(const end of [seg.p1,seg.p2]) {
      const degree=remaining.filter(s=>pointDistance(end,s.p1)<EPSILON || pointDistance(end,s.p2)<EPSILON).length;
      if(degree>2)throw new Error('Branching Join is unsupported');
    }
    remaining.sort((a,b)=>a.entity.id.localeCompare(b.entity.id));
    const chain=[remaining.shift()];
    while(remaining.length) {
      const head=chain[0].p1,tail=chain.at(-1).p2;
      const i=remaining.findIndex(s=>[head,tail].some(p=>pointDistance(p,s.p1)<EPSILON || pointDistance(p,s.p2)<EPSILON));
      if(i<0)throw new Error('Disconnected Join selection');
      const [next]=remaining.splice(i,1);
      const atTail=pointDistance(tail,next.p1)<EPSILON || pointDistance(tail,next.p2)<EPSILON;
      const flip=atTail ? pointDistance(tail,next.p2)<EPSILON : pointDistance(head,next.p1)<EPSILON;
      if(flip){[next.p1,next.p2]=[next.p2,next.p1];next.bulge=-next.bulge;}
      if(atTail)chain.push(next);else chain.unshift(next);
    }
    const originalPositions=new Map(document.entities.map((e,i)=>[e.id,i]));

    // Check if closed
    const isClosed = pointDistance(chain[0].p1, chain[chain.length - 1].p2) < EPSILON;

    // Build vertices
    const vertices = [];
    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];
      vertices.push({
        x: seg.p1.x,
        y: seg.p1.y,
        bulge: seg.bulge || 0,
      });
    }

    if (!isClosed) {
      const lastSeg = chain[chain.length - 1];
      vertices.push({
        x: lastSeg.p2.x,
        y: lastSeg.p2.y,
        bulge: 0,
      });
    }

    // Remove source entities
    this.removedEntities = [];
    for (const seg of chain) {
      const ent = seg.entity;
      const snap = snapshotEntityState(ent);
      const res = document.removeEntity(ent);
      if (res) {
        this.removedEntities.push({ entity: res.entity, index: originalPositions.get(res.entity.id), snapshot: snap });
        changeSet.addDeleted(res.entity, res.index);
      }
    }

    // Create new joined LWPOLYLINE
    const primary = chain[0].entity;
    this.createdPolyline = new DxfEntity({
      type: 'LWPOLYLINE',
      layerId: primary.layerId,
      space: primary.space,
      style: cloneNativeValue(primary.style || {}),
      geometry: {
        vertices,
        closed: isClosed,
        elevation:primary.geometry.start?.z ?? primary.geometry.center?.z ?? 0,
      },
      state: { modified: true, generated: true },
    });

    this.createdPolyline.ownerHandle=primary.ownerHandle;this.createdPolyline.layoutId=primary.layoutId;
    addGenerated(document,this.createdPolyline);
    changeSet.addAdded(this.createdPolyline);

    this.executed = true;
    return changeSet;
  }

  undo(document) {
    const changeSet = new ChangeSet(`UNDO_${this.name}`);

    // Remove created polyline
    if (this.createdPolyline) {
      const res = document.removeEntity(this.createdPolyline.id);
      if (res && res.entity) {
        changeSet.addDeleted(res.entity, res.index);
      }
      this.createdPolyline = null;
    }

    // Restore original source entities
    this.removedEntities.sort((a, b) => a.index - b.index);
    for (const rec of this.removedEntities) {
      restoreEntityState(rec.entity, rec.snapshot, document);
      document.addEntity(rec.entity, rec.index);
      changeSet.addAdded(rec.entity);
    }

    this.executed = false;
    return changeSet;
  }
}
