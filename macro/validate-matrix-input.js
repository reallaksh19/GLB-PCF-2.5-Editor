/**
 * macro/validate-matrix-input.js
 * Hardens macro inputs by strictly validating tabular/array point data
 * before geometry creation.
 */

export function validateMatrixInput(matrix) {
  if (!Array.isArray(matrix)) {
    return {
      ok: false,
      errors: [{ row: null, column: null, code: 'INVALID_INPUT', message: 'Input must be an array' }]
    };
  }

  if (matrix.length === 0) {
    return {
      ok: false,
      errors: [{ row: null, column: null, code: 'EMPTY_ARRAY', message: 'Input array is empty' }]
    };
  }

  const errors = [];
  const points = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];

    if (!row || typeof row !== 'object') {
      errors.push({ row: i, column: null, code: 'INVALID_ROW', message: `Row ${i} must be an object/array of coordinates.` });
      continue;
    }

    // Support both {x, y, z} objects and [x, y, z] arrays
    let x, y, z;
    if (Array.isArray(row)) {
      if (row.length < 2) {
        errors.push({ row: i, column: null, code: 'INSUFFICIENT_COLUMNS', message: `Row ${i} must have at least X and Y.` });
        continue;
      }
      [x, y, z] = row;
    } else {
      ({ x, y, z } = row);
    }

    if (x == null && y == null && z == null) {
      errors.push({ row: i, column: null, code: 'BLANK_ROW', message: `Row ${i} is blank or missing coordinates.` });
      continue;
    }

    const px = Number(x);
    if (!Number.isFinite(px)) errors.push({ row: i, column: 'x', code: 'INVALID_NUMBER', message: `Row ${i} column X must be numeric.` });



    const py = Number(y);
    if (!Number.isFinite(py)) errors.push({ row: i, column: 'y', code: 'INVALID_NUMBER', message: `Row ${i} column Y must be numeric.` });

    const pz = z != null ? Number(z) : 0;
    if (z != null && !Number.isFinite(pz)) errors.push({ row: i, column: 'z', code: 'INVALID_NUMBER', message: `Row ${i} column Z must be numeric.` });

    if (errors.length > 0) continue; // Skip further checks for this row if it's already invalid

    const currentPoint = { x: px, y: py, z: pz };



    // Check for duplicate consecutive points and zero-length segments
    if (points.length > 0) {
      const prev = points[points.length - 1];
      const dx = currentPoint.x - prev.x;
      const dy = currentPoint.y - prev.y;
      const dz = currentPoint.z - prev.z;
      const distSq = dx*dx + dy*dy + dz*dz;



      if (distSq < 0.0001) { // EPSILON for zero length
        errors.push({ row: i, column: null, code: 'DUPLICATE_POINT', message: `Row ${i} is a duplicate of the previous point (zero-length segment).` });
        continue; // Skip adding to points
      }
    }



    points.push(currentPoint);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (points.length < 2) {
    return { ok: false, errors: [{ row: null, column: null, code: 'INSUFFICIENT_POINTS', message: 'At least two distinct points are required to form a line/spline.' }] };
  }

  return { ok: true, points, errors: [] };
}
