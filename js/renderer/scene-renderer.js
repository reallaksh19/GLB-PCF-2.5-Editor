import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { exportSceneToGLB } from '../glb/exportSceneToGLB.js';
import { applyHeatmap, clearHeatmap } from '../ui/heatmap.js';
import { appLogger } from '../debug/logger.js';
import { componentFromUserData } from '../../core/component-model.js';
import { capabilities } from '../capabilities/capability-registry.js';
import { SCALE as SCENE_SCALE } from '../../geometry/pipe-geometry.js';

export class SceneRenderer {
  constructor(container) {
    this._container = container;

    // 1. WebGLRenderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this._renderer.setClearColor(0x0f172a); // NavisDark default
    this._container.appendChild(this._renderer.domElement);

    // 2. CSS2DRenderer
    this._css2dRenderer = new CSS2DRenderer();
    this._css2dRenderer.domElement.style.position = 'absolute';
    this._css2dRenderer.domElement.style.top = '0px';
    this._css2dRenderer.domElement.style.pointerEvents = 'none'; // let mouse events pass to webgl
    this._container.appendChild(this._css2dRenderer.domElement);

    // 3. Cameras (orthographic for 2D/stick, perspective for 3D)
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;
    const frustumSize = 1000;
    this._orthoCamera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      -10000,
      100000
    );
    this._orthoCamera.position.set(1, 1, 1); // isometric fallback

    this._perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.01, 100000);
    this._perspectiveCamera.position.set(1, 1, 1);

    this._camera = this._orthoCamera;
    this._orthoRadius = frustumSize / 2;

    // 4. Controls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enablePan = true;
    this._controls.enableZoom = true;
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.08;
    this._controls.zoomToCursor = true;
    this._controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // 5. Scene setup
    this._scene = new THREE.Scene();
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(1, 1, 1);
    this._scene.add(dirLight);

    // 6. Internal state
    this._meshGroup = new THREE.Group();
    this._scene.add(this._meshGroup);

    this._labelGroup = new THREE.Group();
    this._scene.add(this._labelGroup);

    this._symbolGroup = new THREE.Group();
    this._scene.add(this._symbolGroup);

    // HUD live-draft preview layer (rebuilt every frame, never persisted)
    this._previewGroup = new THREE.Group();
    this._previewGroup.renderOrder = 999;
    this._scene.add(this._previewGroup);

    this._compIndex = new Map();
    this._meshIndex = new Map();
    this._highlighted = null;
    this._highlightedOriginalColor = null;
    this._theme = 'NavisDark';
    this._lineDiagram = false;
    this._visualProfile = 'draft2d';
    this._lastComponents = null;
    this._lastDomain = null;
    this._animId = null;

    // Initial resize
    this.onResize();

    // Start loop
    this._animate();
  }

  _disposeObjectTree(root) {
    root?.traverse?.((node) => {
      if (node.element?.remove) {
        node.element.remove();
      }

      if (node.geometry?.dispose) {
        node.geometry.dispose();
      }

      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((material) => material?.dispose?.());
        } else {
          node.material.dispose?.();
        }
      }
    });
  }

  _addComponentToScene(comp, domain) {
    const mesh = domain.buildMesh(comp, this._theme, {
      lineDiagram: this._lineDiagram,
      visualProfile: this._visualProfile,
    });
    const symbol = domain.buildSymbol(comp);
    const label = domain.buildLabel(comp);

    if (mesh) {
      this._meshGroup.add(mesh);
      this._meshIndex.set(mesh.uuid, comp);
      this._compIndex.set(comp.id, comp);
    }
    if (symbol) {
      this._symbolGroup.add(symbol);
      this._meshIndex.set(symbol.uuid, comp);
    }
    if (label) {
      this._labelGroup.add(label);
    }
  }

  addComponent(comp, domain, autoFit = true) {
    if (!comp || !domain) return;
    try {
      this._addComponentToScene(comp, domain);
      if (autoFit) this.fitAll();
    } catch (err) {
      appLogger.error('SCENE_RENDER_FAIL', { compId: comp.id, message: err.message });
    }
  }

  addComponents(components, domain, autoFit = true) {
    for (const comp of components || []) {
      if (!comp) continue;
      try {
        this._addComponentToScene(comp, domain);
      } catch (err) {
        appLogger.error('SCENE_RENDER_FAIL', { compId: comp.id, message: err.message });
      }
    }
    if (autoFit) this.fitAll();
  }

  _objectTreeHasComponent(root, compId) {
    let found = false;

    root?.traverse?.((node) => {
      if (node.userData?.compId === compId || node.userData?.id === compId) {
        found = true;
      }
    });

    return found;
  }

  removeComponentById(compId) {
    if (!compId) return 0;

    let removed = 0;
    const groups = [this._meshGroup, this._symbolGroup, this._labelGroup, this._previewGroup];

    for (const group of groups) {
      const children = [...(group?.children || [])];

      for (const child of children) {
        if (!this._objectTreeHasComponent(child, compId)) continue;

        group.remove(child);
        this._disposeObjectTree(child);
        removed += 1;
      }
    }

    this._compIndex.delete(compId);

    for (const [uuid, comp] of [...this._meshIndex.entries()]) {
      if (comp?.id === compId) {
        this._meshIndex.delete(uuid);
      }
    }

    if (this._highlighted && this._objectTreeHasComponent(this._highlighted, compId)) {
      this.highlight(null);
    }

    return removed;
  }

  replaceComponent(comp, domain, autoFit = false) {
    if (!comp?.id || !domain) return false;

    this.removeComponentById(comp.id);
    this.addComponent(comp, domain, false);

    if (autoFit) this.fitAll();

    return true;
  }

  reconcileComponents(diff = {}, domain, options = {}) {
    if (!domain) {
      return {
        added: 0,
        updated: 0,
        removed: 0,
        changed: false,
      };
    }

    const removedIds = diff.removedIds || [];
    const updated = diff.updated || [];
    const added = diff.added || [];

    let removed = 0;
    let updatedCount = 0;
    let addedCount = 0;

    for (const compId of removedIds) {
      removed += this.removeComponentById(compId);
    }

    for (const comp of updated) {
      if (this.replaceComponent(comp, domain, false)) {
        updatedCount += 1;
      }
    }

    for (const comp of added) {
      if (!comp) continue;
      this.addComponent(comp, domain, false);
      addedCount += 1;
    }

    if (Array.isArray(options.allComponents)) {
      this._lastComponents = options.allComponents;
      this._lastDomain = domain;
    }

    const changed = removed > 0 || updatedCount > 0 || addedCount > 0;

    if (changed && options.autoFit) {
      this.fitAll();
    }

    return {
      added: addedCount,
      updated: updatedCount,
      removed,
      changed,
    };
  }

  loadComponents(components, domain, autoFit = true) {
    this._lastComponents = components;
    this._lastDomain = domain;
    this.clear();
    this.addComponents(components, domain, autoFit);
  }

  _setActiveCamera(camera) {
    if (!camera || camera === this._camera) return;
    const prev = this._camera;
    const prevPos = prev.position.clone();
    const prevQuat = prev.quaternion.clone();
    const prevTarget = this._controls.target.clone();

    this._camera = camera;
    this._camera.position.copy(prevPos);
    this._camera.quaternion.copy(prevQuat);
    this._controls.object = this._camera;
    this._controls.target.copy(prevTarget);
    this._controls.update();
  }

  _applyControlsForProfile(profileName) {
    if (profileName === '3d') {
      this._controls.enableRotate = true;
      this._controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      this._controls.screenSpacePanning = false;
      return;
    }
    this._controls.enableRotate = false;
    this._controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this._controls.screenSpacePanning = true;
  }

  _applyCameraForProfile(profileName) {
    if (profileName === '3d') this._setActiveCamera(this._perspectiveCamera);
    else this._setActiveCamera(this._orthoCamera);
    this.onResize();
  }

  setLineDiagramMode(flag) {
    const nextProfile = Boolean(flag) ? 'stick' : (this._visualProfile === '3d' ? '3d' : 'draft2d');
    this.applyVisualProfile(nextProfile);
  }

  applyVisualProfile(profileName) {
    const next = profileName === '3d' ? '3d' : (profileName === 'stick' ? 'stick' : 'draft2d');
    this._visualProfile = next;
    this._lineDiagram = next === 'stick';
    this._applyCameraForProfile(next);
    this._applyControlsForProfile(next);

    if (this._lastComponents && this._lastDomain) {
      this.loadComponents(this._lastComponents, this._lastDomain);
      if (next !== '3d') this.setView('front');
      return;
    }

    this.fitAll();
    if (next !== '3d') this.setView('front');
  }

  async loadGLB(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        this.clear();
        this._lastComponents = null;
        this._lastDomain = null;

        gltf.scene.traverse(node => {
          if (node.isMesh && node.userData && node.userData.compId) {
            const comp = componentFromUserData(node.userData);
            this._meshIndex.set(node.uuid, comp);
            this._compIndex.set(comp.id, comp);
          }
        });

        this._meshGroup.add(gltf.scene);
        this.fitAll();
        resolve();
      }, undefined, (error) => {
        appLogger.error('GLB_LOAD_FAIL', { message: error.message });
        reject(error);
      });
    });
  }

  clear() {
    [this._meshGroup, this._labelGroup, this._symbolGroup, this._previewGroup].forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        this._disposeObjectTree(child);
      }
    });
    this._compIndex.clear();
    this._meshIndex.clear();
    this.highlight(null);
  }

  setHeatmap(field, components) {
    if (field === 'none') {
      clearHeatmap(this._scene);
    } else {
      applyHeatmap(this._scene, field, components);
    }
  }

  setTheme(theme) {
    const normalizedTheme = theme === 'DrawLight' ? 'DraftLight' : (theme === 'DrawDark' ? 'DraftDark' : theme);
    this._theme = normalizedTheme;
    let clearColor = 0x0f172a;
    switch (normalizedTheme) {
      case 'DraftLight': clearColor = 0xe2e8f0; break;
      case 'DraftDark': clearColor = 0x0f172a; break;
      case 'Blueprint': clearColor = 0x1e3a8a; break;
      case 'MonochromeTechnical': clearColor = 0x171717; break;
      case 'HighContrastReview': clearColor = 0x000000; break;
      case 'NavisDark':
      default:
        clearColor = 0x0f172a; break;
    }
    this._renderer.setClearColor(clearColor);
  }

  setLabelsVisible(visible) {
    this._labelGroup.visible = visible;
  }

  _syncOrthoFrustum(radius) {
    const width = Math.max(this._container.clientWidth, 1);
    const height = Math.max(this._container.clientHeight, 1);
    const aspect = width / height;
    const r = Math.max(radius, 0.001);
    this._orthoRadius = r;
    this._orthoCamera.left = -r * aspect;
    this._orthoCamera.right = r * aspect;
    this._orthoCamera.top = r;
    this._orthoCamera.bottom = -r;
    this._orthoCamera.updateProjectionMatrix();
  }

  _perspectiveFitDistance(radius) {
    const r = Math.max(radius, 0.001);
    const width = Math.max(this._container.clientWidth, 1);
    const height = Math.max(this._container.clientHeight, 1);
    const aspect = width / height;
    const vFov = THREE.MathUtils.degToRad(this._perspectiveCamera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distV = r / Math.sin(vFov / 2);
    const distH = r / Math.sin(hFov / 2);
    return Math.max(distV, distH) * 1.15;
  }

  setView(preset) {
    const hasGeom = this._meshGroup.children.length > 0 || this._symbolGroup.children.length > 0;
    if (!hasGeom) return;

    const box = new THREE.Box3();
    if (this._meshGroup.children.length > 0) box.expandByObject(this._meshGroup);
    if (this._symbolGroup.children.length > 0) box.expandByObject(this._symbolGroup);
    if (box.isEmpty()) return;

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const r = Math.max(sphere.radius || 1, 0.001);

    if (this._camera === this._orthoCamera) {
      this._syncOrthoFrustum(r * 1.05);
    }

    const dist = this._camera === this._perspectiveCamera
      ? this._perspectiveFitDistance(r)
      : (r * 2.2);
    const dir = new THREE.Vector3(0, 0, 1);
    switch (preset) {
      case 'iso-ne': dir.set(1, 1, 1); break;
      case 'iso-nw': dir.set(-1, 1, 1); break;
      case 'iso-se': dir.set(1, 1, -1); break;
      case 'iso-sw': dir.set(-1, 1, -1); break;
      case 'plan':   dir.set(0, 1, 0); break;
      case 'front':  dir.set(0, 0, 1); break;
      case 'right':  dir.set(1, 0, 0); break;
      case 'left':   dir.set(-1, 0, 0); break;
      case 'back':   dir.set(0, 0, -1); break;
      default:       dir.set(0, 0, 1); break;
    }

    this._camera.position.copy(sphere.center).add(dir.normalize().multiplyScalar(dist));
    this._camera.lookAt(sphere.center);
    if (this._camera === this._perspectiveCamera) {
      this._perspectiveCamera.near = Math.max(0.01, dist - r * 6);
      this._perspectiveCamera.far = Math.max(1000, dist + r * 10);
      this._perspectiveCamera.updateProjectionMatrix();
    }
    this._controls.target.copy(sphere.center);
    this._controls.update();
  }

  fitAll() {
    if (this._meshGroup.children.length === 0 && this._symbolGroup.children.length === 0) return;

    const box = new THREE.Box3();
    if (this._meshGroup.children.length > 0) box.expandByObject(this._meshGroup);
    if (this._symbolGroup.children.length > 0) box.expandByObject(this._symbolGroup);

    if (box.isEmpty()) return;

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    const r = Math.max(sphere.radius || 1, 0.001);
    this._syncOrthoFrustum(r * 1.1);

    const dist = this._camera === this._perspectiveCamera
      ? this._perspectiveFitDistance(r)
      : (r * 2.2);
    if (this._visualProfile === '3d') {
      this._camera.position.copy(sphere.center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist));
      this._perspectiveCamera.near = Math.max(0.01, dist - r * 6);
      this._perspectiveCamera.far = Math.max(1000, dist + r * 10);
      this._perspectiveCamera.updateProjectionMatrix();
    } else {
      this._camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, dist));
    }
    this._camera.lookAt(sphere.center);

    this._controls.target.copy(sphere.center);
    this._controls.update();
  }

  pick(ndcX, ndcY) {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.05;
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, this._camera);

    const intersects = raycaster.intersectObjects([...this._meshGroup.children, ...this._symbolGroup.children], true);
    if (intersects.length > 0) {
      let node = intersects[0].object;
      while (node) {
        if (node.userData && node.userData.compId) {
          const comp = this._meshIndex.get(node.uuid) || this._compIndex.get(node.userData.compId);
          if (comp) return { comp, mesh: node };
        }
        node = node.parent;
      }
    }
    return null;
  }

  pickPlane(ndcX, ndcY, planeZ = 0) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, this._camera);
    // Plane argument uses model-space Z (mm). Scene Y stores model Z through axis remap + scaling.
    const sceneY = Number(planeZ || 0) * SCENE_SCALE;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sceneY);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(plane, hit);
    if (!ok) return null;
    // Inverse of toThree mapping: scene (x,y,z) => model-mm (x=z/S, y=x/S, z=y/S)
    return {
      x: hit.z / SCENE_SCALE,
      y: hit.x / SCENE_SCALE,
      z: hit.y / SCENE_SCALE,
    };
  }

  highlight(mesh) {
    if (this._highlighted && this._highlighted !== mesh) {
      if (this._highlightedOriginalColor?.mode === 'emissive' && this._highlightedOriginalColor?.material?.emissive && this._highlightedOriginalColor?.color) {
        this._highlightedOriginalColor.material.emissive.copy(this._highlightedOriginalColor.color);
      }
      if (this._highlightedOriginalColor?.mode === 'color' && this._highlightedOriginalColor?.material?.color && this._highlightedOriginalColor?.color) {
        this._highlightedOriginalColor.material.color.copy(this._highlightedOriginalColor.color);
      }
      this._highlighted = null;
      this._highlightedOriginalColor = null;
    }

    if (mesh && mesh !== this._highlighted) {
      this._highlighted = mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const emissiveMaterial = materials.find(
        mat => mat && mat.emissive && typeof mat.emissive.clone === 'function' && typeof mat.emissive.setHex === 'function'
      );
      if (emissiveMaterial) {
        this._highlightedOriginalColor = {
          mode: 'emissive',
          material: emissiveMaterial,
          color: emissiveMaterial.emissive.clone(),
        };
        emissiveMaterial.emissive.setHex(0x223344);
      } else {
        const colorMaterial = materials.find(
          mat => mat && mat.color && typeof mat.color.clone === 'function' && typeof mat.color.setHex === 'function'
        );
        if (colorMaterial) {
          this._highlightedOriginalColor = {
            mode: 'color',
            material: colorMaterial,
            color: colorMaterial.color.clone(),
          };
          colorMaterial.color.setHex(0xf59e0b);
        } else {
          this._highlightedOriginalColor = null;
        }
      }
    }
  }

  async exportGLB() {
    try {
      const blob = await exportSceneToGLB(this._scene);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scene.glb';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      appLogger.error('GLB_EXPORT_FAIL', { message: err.message });
    }
  }

  onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    if (w === 0 || h === 0) return;

    this._renderer.setSize(w, h);
    this._css2dRenderer.setSize(w, h);

    const aspect = w / h;
    this._perspectiveCamera.aspect = aspect;
    this._perspectiveCamera.updateProjectionMatrix();

    const fallbackRadius = (this._orthoCamera.top - this._orthoCamera.bottom) / 2 || 1;
    const radius = Math.max(this._orthoRadius || fallbackRadius, 0.001);
    this._orthoCamera.left = -radius * aspect;
    this._orthoCamera.right = radius * aspect;
    this._orthoCamera.top = radius;
    this._orthoCamera.bottom = -radius;
    this._orthoCamera.updateProjectionMatrix();
  }

  dispose() {
    if (this._animId) cancelAnimationFrame(this._animId);
    this._controls.dispose();
    this._renderer.dispose();
    if (this._renderer.domElement.parentNode) this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
    if (this._css2dRenderer.domElement.parentNode) this._css2dRenderer.domElement.parentNode.removeChild(this._css2dRenderer.domElement);
    this.clear();
  }

  /**
   * Rebuild the live-draft preview from the current HUD state.
   * Called every animation frame so the yellow ghost follows the cursor.
   * Points are in model-mm; we apply the same axis-remap as toThree():
   *   threeX = model.y * SCALE,  threeY = model.z * SCALE,  threeZ = model.x * SCALE
   */
  updateHudPreview(hudState) {
    // Clear old preview geometry
    while (this._previewGroup.children.length > 0) {
      const child = this._previewGroup.children[0];
      this._previewGroup.remove(child);
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
      else child.material?.dispose?.();
    }

    if (!hudState?.visible || !hudState?.mode || hudState.mode === 'idle') return;

    // Collect model-mm points based on mode
    const rawPts = [];
    if (hudState.mode === 'line-draw') {
      const a = hudState.draft?.anchorPoint;
      const b = hudState.draft?.previewPoint;
      if (a && b) { rawPts.push(a, b); }
    } else if (hudState.mode === 'polyline-draw' || hudState.mode === 'spline-draw') {
      for (const p of hudState.draftPoints || []) rawPts.push(p);
      if (hudState.currentPreviewPoint) rawPts.push(hudState.currentPreviewPoint);
    }

    if (rawPts.length < 2) return;

    // Convert model-mm → THREE scene coords (same axis remap as toThree())
    const S = SCENE_SCALE;
    const toV = (p) => new THREE.Vector3(p.y * S, p.z * S, p.x * S);
    const vecs = rawPts.map(toV);

    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false });

    if (hudState.mode === 'spline-draw' && vecs.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(vecs);
      const geo = new THREE.BufferGeometry().setFromPoints(
        curve.getPoints(Math.max(60, vecs.length * 12))
      );
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 999;
      this._previewGroup.add(line);
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints(vecs);
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 999;
      this._previewGroup.add(line);
    }
  }

  _animate() {
    this._animId = requestAnimationFrame(() => this._animate());
    this._controls.update();
    // Drive live-draft preview from HUD state every frame
    if (typeof window !== 'undefined' && window.__hudApi) {
      this.updateHudPreview(window.__hudApi.getState());
    }
    this._renderer.render(this._scene, this._camera);
    this._css2dRenderer.render(this._scene, this._camera);
  }
}

// ─── Self-check (runs only in dev mode) ───────────────────────────────────────
async function _selfCheck() {
  const { MOCK_PCF_TEXT, MOCK_EXPECTED } = await import('../../js/mock/mock-data.js');
  const { parsePcf } = await import('../../domains/piping/parser.js');
  const { domain } = await import('../../domains/piping/index.js');

  const failures = [];

  const container = document.createElement('div');
  container.style.width = '800px';
  container.style.height = '600px';
  document.body.appendChild(container);

  try {
    const mockLog = { info:()=>{}, warn:()=>{}, error:()=>{}, count:()=>0 };
    const components = parsePcf(MOCK_PCF_TEXT, mockLog);

    const renderer = new SceneRenderer(container);
    renderer.loadComponents(components, domain);

    let meshCount = 0;
    renderer._meshGroup.traverse(child => { if (child.isMesh) meshCount++; });

    if (meshCount < MOCK_EXPECTED.scene.meshCountMin) {
      failures.push(`meshCount: expected >= ${MOCK_EXPECTED.scene.meshCountMin}, got ${meshCount}`);
    }

    renderer.dispose();
  } catch (err) {
    failures.push(`Renderer threw error: ${err.message}`);
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }

  return { pass: failures.length === 0, failures };
}

if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
  _selfCheck().then(({ pass, failures }) => {
    if (pass) capabilities.ready('scene-renderer');
    else       capabilities.fail('scene-renderer', failures);
  });
}
