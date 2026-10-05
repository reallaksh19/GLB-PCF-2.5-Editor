/**
 * core/spatial/spatial-index-2d.js
 *
 * Format-independent 2D R-Tree Spatial Index.
 * High-performance, self-contained 2D spatial tree supporting:
 * - Sort-Tile-Recursive (STR) optimal bulk-loading
 * - Point queries with proximity sorting
 * - CAD Window queries (fully contained items)
 * - CAD Crossing queries (intersecting / touching items)
 *
 * Invariant: Zero Three.js or DOM dependencies.
 */

export const DEFAULT_MAX_ENTRIES = 16;
export const DEFAULT_MIN_ENTRIES = 4;

function normalizeBox(item) {
  let minX, minY, maxX, maxY;

  if (item.minX != null && item.maxX != null) {
    minX = Number(item.minX);
    minY = Number(item.minY);
    maxX = Number(item.maxX);
    maxY = Number(item.maxY);
  } else if (item.min != null && item.max != null) {
    minX = Number(item.min.x);
    minY = Number(item.min.y);
    maxX = Number(item.max.x);
    maxY = Number(item.max.y);
  } else if (item.x != null && item.y != null) {
    minX = maxX = Number(item.x);
    minY = maxY = Number(item.y);
  } else {
    minX = minY = -Infinity;
    maxX = maxY = Infinity;
  }

  return {
    ...item,
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

function intersects(a, b) {
  return a.minX <= b.maxX &&
         a.maxX >= b.minX &&
         a.minY <= b.maxY &&
         a.maxY >= b.minY;
}

function contains(outer, inner) {
  return inner.minX >= outer.minX - 1e-9 &&
         inner.maxX <= outer.maxX + 1e-9 &&
         inner.minY >= outer.minY - 1e-9 &&
         inner.maxY <= outer.maxY + 1e-9;
}

function distanceToBox(x, y, box) {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dy = Math.max(box.minY - y, 0, y - box.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}

function calcBBox(node) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const child of node.children) {
    minX = Math.min(minX, child.minX);
    minY = Math.min(minY, child.minY);
    maxX = Math.max(maxX, child.maxX);
    maxY = Math.max(maxY, child.maxY);
  }

  node.minX = minX;
  node.minY = minY;
  node.maxX = maxX;
  node.maxY = maxY;
}

export class SpatialIndex2D {
  /**
   * @param {number} [maxEntries=16]
   */
  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = Math.max(4, maxEntries);
    this.minEntries = Math.max(2, Math.ceil(this.maxEntries * 0.4));
    this.clear();
  }

  clear() {
    this.root = {
      children: [],
      leaf: true,
      height: 1,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    this._size = 0;
  }

  get size() {
    return this._size;
  }

  /**
   * Bulk-load items using Sort-Tile-Recursive (STR) packing.
   * Produces an optimal, low-overlap balanced R-Tree in O(N log N).
   *
   * @param {Array<Object>} items
   */
  load(items = []) {
    if (!Array.isArray(items) || items.length === 0) return;

    const normalized = [...this.all(),...items.map(normalizeBox)];
    this._size = normalized.length;
    if (normalized.length <= this.maxEntries) {
      this.root = {children:normalized,leaf:true,height:1};
      calcBBox(this.root);return;
    }

    // Recursively build tree levels from bottom up
    this.root = this._buildTree(normalized, 1);
  }

  _buildTree(items, height) {
    const N = items.length;
    const M = this.maxEntries;

    if (N <= M) {
      const node = {
        children: items,
        leaf: height === 1,
        height,
        minX: 0, minY: 0, maxX: 0, maxY: 0,
      };
      calcBBox(node);
      return node;
    }

    // Number of leaf nodes needed at this level
    const numLeaves = Math.ceil(N / M);
    // Number of vertical slices
    const numCols = Math.ceil(Math.sqrt(numLeaves));
    const itemsPerCol = numCols * M;

    // Sort items by center X
    items.sort((a, b) => ((a.minX + a.maxX) / 2) - ((b.minX + b.maxX) / 2));

    const nodes = [];

    for (let i = 0; i < N; i += itemsPerCol) {
      const colItems = items.slice(i, i + itemsPerCol);
      // Sort column items by center Y
      colItems.sort((a, b) => ((a.minY + a.maxY) / 2) - ((b.minY + b.maxY) / 2));

      for (let j = 0; j < colItems.length; j += M) {
        const slice = colItems.slice(j, j + M);
        const node = {
          children: slice,
          leaf: height === 1,
          height,
          minX: 0, minY: 0, maxX: 0, maxY: 0,
        };
        calcBBox(node);
        nodes.push(node);
      }
    }

    return this._buildTree(nodes, height + 1);
  }

  /**
   * Insert a single item into the spatial index.
   * @param {Object} rawItem
   */
  insert(rawItem) {
    if (!rawItem) return;
    const item = normalizeBox(rawItem);
    const sibling=this._insert(item,this.root);
    if(sibling) {
      this.root={children:[this.root,sibling],leaf:false,height:this.root.height+1};
      calcBBox(this.root);
    }
    this._size++;
  }

  _insert(item,node) {
    if(node.leaf) node.children.push(item);
    else {
      let best=node.children[0],bestArea=Infinity;
      for(const child of node.children) {
        const area=(Math.max(child.maxX,item.maxX)-Math.min(child.minX,item.minX))*(Math.max(child.maxY,item.maxY)-Math.min(child.minY,item.minY))-(child.maxX-child.minX)*(child.maxY-child.minY);
        if(area<bestArea) { bestArea=area;best=child; }
      }
      const sibling=this._insert(item,best);
      if(sibling)node.children.push(sibling);
    }
    calcBBox(node);
    return node.children.length>this.maxEntries?this._split(node):null;
  }

  _split(node) {
    if (node.children.length <= this.maxEntries) return;

    // Linear split by sorting along dominant axis
    const dx = node.maxX - node.minX;
    const dy = node.maxY - node.minY;

    if (dx >= dy) {
      node.children.sort((a, b) => a.minX - b.minX);
    } else {
      node.children.sort((a, b) => a.minY - b.minY);
    }

    const mid = Math.floor(node.children.length / 2);
    const leftChildren = node.children.slice(0, mid);
    const rightChildren = node.children.slice(mid);

    const newNode = {
      children: rightChildren,
      leaf: node.leaf,
      height: node.height,
      minX: 0, minY: 0, maxX: 0, maxY: 0,
    };
    calcBBox(newNode);

    node.children = leftChildren;
    calcBBox(node);

    return newNode;
  }

  /**
   * Remove item(s) by id or matching predicate from spatial index.
   *
   * @param {string|Function} idOrPredicate
   * @returns {number} count of items removed
   */
  remove(idOrPredicate) {
    const isMatch = typeof idOrPredicate === 'function'
      ? idOrPredicate
      : (item) => item?.id === idOrPredicate;

    let removedCount = 0;

    function traverse(node) {
      if (node.leaf) {
        const initialLen = node.children.length;
        node.children = node.children.filter((child) => !isMatch(child));
        const diff = initialLen - node.children.length;
        if (diff > 0) {
          removedCount += diff;
          calcBBox(node);
        }
        return diff > 0;
      }

      let childChanged = false;
      for (const child of node.children) {
        if (traverse(child)) {
          childChanged = true;
        }
      }

      if (childChanged) {
        // Prune empty inner children
        node.children = node.children.filter((c) => (c.leaf ? c.children.length > 0 : c.children.length > 0));
        calcBBox(node);
      }
      return childChanged;
    }

    traverse(this.root);
    this._size = Math.max(0, this._size - removedCount);
    if(!this._size) this.clear();
    else while(!this.root.leaf && this.root.children.length===1) this.root=this.root.children[0];
    return removedCount;
  }

  /**
   * Search for all items whose bounding box intersects query box.
   * @param {Object} queryBox - { minX, minY, maxX, maxY }
   * @returns {Array<Object>}
   */
  search(queryBox) {
    const q = normalizeBox(queryBox);
    const results = [];

    function traverse(node) {
      if (!intersects(node, q)) return;

      if (node.leaf) {
        for (const item of node.children) {
          if (intersects(item, q)) {
            results.push(item);
          }
        }
      } else {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(this.root);
    return results;
  }

  /**
   * CAD Point Selection: finds items within tolerance of (x, y) sorted by ascending distance.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} [tolerance=5]
   * @returns {Array<Object>}
   */
  searchPoint(x, y, tolerance = 5) {
    const tol = Math.max(0, Number(tolerance) || 0);
    const q = {
      minX: x - tol,
      minY: y - tol,
      maxX: x + tol,
      maxY: y + tol,
    };

    const hits = this.search(q);
    // Sort by ascending distance to query point
    return hits
      .map((item) => ({ item, dist: distanceToBox(x, y, item) }))
      .sort((a, b) => a.dist - b.dist)
      .map((entry) => entry.item);
  }

  /**
   * CAD Window Selection (left-to-right drag):
   * Selects only items whose bounding box is FULLY CONTAINED within windowBox.
   *
   * @param {Object} windowBox - { minX, minY, maxX, maxY }
   * @returns {Array<Object>}
   */
  searchWindow(windowBox) {
    const win = normalizeBox(windowBox);
    const results = [];

    function traverse(node) {
      if (!intersects(node, win)) return;

      if (node.leaf) {
        for (const item of node.children) {
          if (contains(win, item)) {
            results.push(item);
          }
        }
      } else {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(this.root);
    return results;
  }

  /**
   * CAD Crossing Selection (right-to-left drag):
   * Selects items that INTERSECT or TOUCH crossingBox (includes contained items).
   *
   * @param {Object} crossingBox - { minX, minY, maxX, maxY }
   * @returns {Array<Object>}
   */
  searchCrossing(crossingBox) {
    return this.search(crossingBox);
  }

  /**
   * Return all items indexed in the tree.
   * @returns {Array<Object>}
   */
  all() {
    const results = [];
    function traverse(node) {
      if (node.leaf) {
        results.push(...node.children);
      } else {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }
    traverse(this.root);
    return results;
  }
}
