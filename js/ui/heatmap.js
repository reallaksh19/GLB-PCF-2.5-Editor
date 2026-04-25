import * as THREE from 'three';
import { colorForMaterial, heatMapColor } from '../../geometry/pipe-geometry.js';
import { capabilities } from '../../js/capabilities/capability-registry.js';

export function buildHeatmapRange(components, field) {
  let min = Infinity;
  let max = -Infinity;

  for (const comp of components) {
    let val = null;
    if (field === 'OD' || field === 'bore') {
      val = comp.geometry?.bore;
      if (val === undefined && comp.attributes?.['BORE']) val = parseFloat(comp.attributes['BORE']);
      if (val === undefined && comp.raw?.['BORE']) val = parseFloat(comp.raw['BORE']);
      if (val === undefined && comp.geometry && comp.geometry.radius) val = comp.geometry.radius * 2;
    } else {
      const rawVal = comp.attributes?.[field];
      if (rawVal !== undefined && rawVal !== null) {
        const parsed = parseFloat(rawVal);
        if (!isNaN(parsed)) val = parsed;
      }
    }

    if (val !== null && !isNaN(val)) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  if (min === Infinity || max === -Infinity) {
    return { min: 0, max: 1 };
  }

  return { min, max };
}

function setMaterialColor(material, colorHex) {
  if (!material || !material.color) return;
  material.color.setHex(colorHex);
  material.needsUpdate = true;
}

function captureOriginalColor(obj) {
  if (Array.isArray(obj.material)) {
    if (!Array.isArray(obj.userData._origColor)) {
      obj.userData._origColor = obj.material.map(m => m?.color?.getHex?.());
    }
  } else if (obj.material && obj.userData._origColor === undefined) {
    obj.userData._origColor = obj.material.color.getHex();
  }
}

export function applyHeatmap(scene, field, components) {
  if (!scene || !components || components.length === 0) return;

  const compMap = new Map();
  for (const c of components) compMap.set(c.id, c);

  const range = buildHeatmapRange(components, field);
  const rangeDiff = range.max - range.min || 1;

  scene.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;

    let current = obj;
    let compId = null;
    while (current && !compId) {
      if (current.userData?.compId) compId = current.userData.compId;
      current = current.parent;
    }
    if (!compId) return;

    const comp = compMap.get(compId);
    if (!comp) return;

    let colorHex = 0xb8c4d2;

    if (field === 'material') {
      let mat = 'UNKNOWN';
      if (comp.attributes?.['MATERIAL']) mat = comp.attributes['MATERIAL'];
      else if (comp.raw?.['MATERIAL']) mat = comp.raw['MATERIAL'];
      else if (comp.attributes?.['MATERIAL-1']) mat = comp.attributes['MATERIAL-1'];
      else if (comp.raw?.['MATERIAL-1']) mat = comp.raw['MATERIAL-1'];
      colorHex = colorForMaterial(mat);
    } else {
      let val = null;
      if (field === 'OD' || field === 'bore') {
        val = comp.geometry?.bore;
        if (val === undefined && comp.attributes?.['BORE']) val = parseFloat(comp.attributes['BORE']);
        if (val === undefined && comp.raw?.['BORE']) val = parseFloat(comp.raw['BORE']);
        if (val === undefined && comp.geometry?.radius) val = comp.geometry.radius * 2;
      } else {
        const rawVal = comp.attributes?.[field];
        if (rawVal !== undefined && rawVal !== null) val = parseFloat(rawVal);
      }

      if (val !== null && !isNaN(val)) {
        const normalized = (val - range.min) / rangeDiff;
        colorHex = heatMapColor(normalized);
      }
    }

    captureOriginalColor(obj);
    if (Array.isArray(obj.material)) obj.material.forEach(m => setMaterialColor(m, colorHex));
    else setMaterialColor(obj.material, colorHex);
  });
}

export function clearHeatmap(scene) {
  if (!scene) return;

  scene.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;

    if (Array.isArray(obj.material)) {
      const orig = Array.isArray(obj.userData._origColor) ? obj.userData._origColor : [];
      obj.material.forEach((m, idx) => {
        if (orig[idx] !== undefined) setMaterialColor(m, orig[idx]);
      });
    } else if (obj.userData._origColor !== undefined) {
      setMaterialColor(obj.material, obj.userData._origColor);
    }
  });
}

async function _selfCheck() {
  const { MOCK_PCF_TEXT, MOCK_EXPECTED } = await import('../../js/mock/mock-data.js');
  const { parsePcf } = await import('../../domains/piping/parser.js');
  const { domain } = await import('../../domains/piping/index.js');
  const mockLog = { info: () => {}, warn: () => {}, error: () => {}, count: () => 0 };
  const components = parsePcf(MOCK_PCF_TEXT, mockLog);

  const dummyScene = new THREE.Scene();
  for (const comp of components) {
    const mesh = domain.buildMesh(comp, 'NavisDark');
    if (mesh) {
      mesh.userData = { ...(mesh.userData || {}), compId: comp.id };
      dummyScene.add(mesh);
    }
  }

  const failures = [];
  if (components.length === 0) failures.push('No components loaded.');

  applyHeatmap(dummyScene, 'OD', components);
  const distinctOD = new Set();
  dummyScene.traverse(obj => {
    if (obj.isMesh && obj.material?.color) distinctOD.add(obj.material.color.getHexString());
  });
  if (distinctOD.size < MOCK_EXPECTED.heatmap.distinctColorsOD) {
    failures.push(`Distinct OD colors < ${MOCK_EXPECTED.heatmap.distinctColorsOD}`);
  }

  applyHeatmap(dummyScene, 'material', components);
  const distinctMat = new Set();
  dummyScene.traverse(obj => {
    if (obj.isMesh && obj.material?.color) distinctMat.add(obj.material.color.getHexString());
  });
  if (distinctMat.size < 2) {
    failures.push('Material heatmap did not produce at least 2 colors');
  }

  clearHeatmap(dummyScene);
  return { pass: failures.length === 0, failures };
}

if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
  _selfCheck().then(({ pass, failures }) => {
    if (pass) capabilities.ready('heatmap');
    else capabilities.fail('heatmap', failures);
  });
}
