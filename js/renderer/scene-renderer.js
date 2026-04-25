import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { exportSceneToGLB } from '../glb/exportSceneToGLB.js';
import { applyHeatmap, clearHeatmap } from '../ui/heatmap.js';
import { appLogger } from '../debug/logger.js';
import { componentFromUserData } from '../../core/component-model.js';
import { capabilities } from '../capabilities/capability-registry.js';

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

    // 3. Camera (Orthographic)
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 1000;
    this._camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2, frustumSize * aspect / 2,
      frustumSize / 2, frustumSize / -2,
      -10000, 100000
    );
    this._camera.position.set(1, 1, 1); // isometric

    // 4. Controls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableRotate = true;
    this._controls.enablePan = true;
    this._controls.enableZoom = true;
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.08;
    this._controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
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

    this._compIndex = new Map();
    this._meshIndex = new Map();
    this._highlighted = null;
    this._highlightedOriginalColor = null;
    this._theme = 'NavisDark';
    this._animId = null;

    // Initial resize
    this.onResize();

    // Start loop
    this._animate();
  }

  _addComponentToScene(comp, domain) {
    const mesh = domain.buildMesh(comp, this._theme);
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

  addComponent(comp, domain) {
    if (!comp || !domain) return;
    try {
      this._addComponentToScene(comp, domain);
      this.fitAll();
    } catch (err) {
      appLogger.error('SCENE_RENDER_FAIL', { compId: comp.id, message: err.message });
    }
  }

  addComponents(components, domain) {
    for (const comp of components || []) {
      if (!comp) continue;
      try {
        this._addComponentToScene(comp, domain);
      } catch (err) {
        appLogger.error('SCENE_RENDER_FAIL', { compId: comp.id, message: err.message });
      }
    }
    this.fitAll();
  }

  loadComponents(components, domain) {
    this.clear();
    this.addComponents(components, domain);
  }

  async loadGLB(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        this.clear();

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
    [this._meshGroup, this._labelGroup, this._symbolGroup].forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
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
    this._theme = theme;
    this._renderer.setClearColor(theme === 'NavisDark' ? 0x0f172a : 0xf7f8fb);
  }

  setLabelsVisible(visible) {
    this._labelGroup.visible = visible;
  }

  setView(preset) {
    if (this._meshGroup.children.length === 0) return;

    const box = new THREE.Box3().setFromObject(this._meshGroup);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const dist = sphere.radius * 2;

    switch (preset) {
      case 'iso-ne': this._camera.position.set(1, 1, 1).normalize().multiplyScalar(dist); break;
      case 'iso-nw': this._camera.position.set(-1, 1, 1).normalize().multiplyScalar(dist); break;
      case 'iso-se': this._camera.position.set(1, 1, -1).normalize().multiplyScalar(dist); break;
      case 'iso-sw': this._camera.position.set(-1, 1, -1).normalize().multiplyScalar(dist); break;
      case 'plan':   this._camera.position.set(0, 1, 0).multiplyScalar(dist); break;
      case 'front':  this._camera.position.set(0, 0, 1).multiplyScalar(dist); break;
      case 'right':  this._camera.position.set(1, 0, 0).multiplyScalar(dist); break;
      case 'left':   this._camera.position.set(-1, 0, 0).multiplyScalar(dist); break;
      case 'back':   this._camera.position.set(0, 0, -1).multiplyScalar(dist); break;
    }

    this._camera.position.add(sphere.center);
    this._camera.lookAt(sphere.center);
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

    const aspect = this._container.clientWidth / this._container.clientHeight;
    const r = sphere.radius || 1;

    this._camera.left = -r * aspect;
    this._camera.right = r * aspect;
    this._camera.top = r;
    this._camera.bottom = -r;
    this._camera.updateProjectionMatrix();

    const dist = r * 2;
    this._camera.position.copy(sphere.center).add(new THREE.Vector3(dist, dist, dist));
    this._camera.lookAt(sphere.center);

    this._controls.target.copy(sphere.center);
    this._controls.update();
  }

  pick(ndcX, ndcY) {
    const raycaster = new THREE.Raycaster();
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

  highlight(mesh) {
    if (this._highlighted && this._highlighted !== mesh) {
      if (this._highlighted.material && this._highlightedOriginalColor) {
        this._highlighted.material.emissive.copy(this._highlightedOriginalColor);
      }
      this._highlighted = null;
      this._highlightedOriginalColor = null;
    }

    if (mesh && mesh !== this._highlighted) {
      this._highlighted = mesh;
      if (mesh.material) {
        this._highlightedOriginalColor = mesh.material.emissive.clone();
        mesh.material.emissive.setHex(0x223344);
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
    const r = (this._camera.top - this._camera.bottom) / 2;
    this._camera.left = -r * aspect;
    this._camera.right = r * aspect;
    this._camera.updateProjectionMatrix();
  }

  dispose() {
    if (this._animId) cancelAnimationFrame(this._animId);
    this._controls.dispose();
    this._renderer.dispose();
    if (this._renderer.domElement.parentNode) this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
    if (this._css2dRenderer.domElement.parentNode) this._css2dRenderer.domElement.parentNode.removeChild(this._css2dRenderer.domElement);
    this.clear();
  }

  _animate() {
    this._animId = requestAnimationFrame(() => this._animate());
    this._controls.update();
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
