import re

with open('js/vendor/buildDraftingScene.js', 'r') as f:
    c = f.read()

# Update COLORS object
colors_def = """const COLORS = {
  NavisDark: { pipe: 0xb8c4d2, flange: 0x8899aa, valve: 0x6699aa, generic: 0x9aabb8 },
  DraftLight:  { pipe: 0x2d3748, flange: 0x1a2535, valve: 0x334455, generic: 0x3d4f62 },
  DraftDark:   { pipe: 0xcbd5e1, flange: 0x94a3b8, valve: 0x64748b, generic: 0x475569 },
  Blueprint:   { pipe: 0xffffff, flange: 0xbfdbfe, valve: 0x93c5fd, generic: 0x60a5fa },
  MonochromeTechnical: { pipe: 0xf5f5f5, flange: 0xd4d4d4, valve: 0xa3a3a3, generic: 0x737373 },
  HighContrastReview:  { pipe: 0x00ff00, flange: 0xffff00, valve: 0xff00ff, generic: 0xffffff }
};
"""
c = re.sub(r'const COLORS = {[^}]+};\n', colors_def, c, flags=re.DOTALL)

# Update buildValveDraft to use a bow-tie shape instead of a sphere
valve_logic = """export function buildValveDraft(comp, theme) {
  let origin;
  if (comp.geometry.ep1 && comp.geometry.ep2) {
    const ep1V = toVec3(comp.geometry.ep1);
    const ep2V = toVec3(comp.geometry.ep2);
    origin = ep1V.clone().add(ep2V).multiplyScalar(0.5);
  } else {
    origin = toVec3(comp.geometry.origin);
  }

  const radius = mmToScene(minBore(comp.geometry.bore) / 2);
  const length = radius * 3;

  const geo1 = new THREE.ConeGeometry(radius * 1.5, length, 12);
  const geo2 = new THREE.ConeGeometry(radius * 1.5, length, 12);
  geo1.rotateX(Math.PI / 2);
  geo2.rotateX(-Math.PI / 2);
  geo1.translate(0, 0, length / 2);
  geo2.translate(0, 0, -length / 2);

  const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'valve') });
  const mesh1 = new THREE.Mesh(geo1, mat);
  const mesh2 = new THREE.Mesh(geo2, mat);

  const group = new THREE.Group();
  group.add(mesh1, mesh2);
  group.position.copy(origin);

  if (comp.geometry.ep1 && comp.geometry.ep2) {
    const ep1V = toVec3(comp.geometry.ep1);
    const ep2V = toVec3(comp.geometry.ep2);
    orientCylinder(group, ep1V, ep2V);
    group.position.copy(origin); // reset position after rotation
  }

  setUserData(group, comp);
  return group;
}"""

c = re.sub(r'export function buildValveDraft\(comp, theme\).*?return sphere;\n}', valve_logic, c, flags=re.DOTALL)

with open('js/vendor/buildDraftingScene.js', 'w') as f:
    f.write(c)


# Update scene-renderer.js theme mappings
with open('js/renderer/scene-renderer.js', 'r') as f:
    sr = f.read()

theme_mapping = """  setTheme(theme) {
    this._theme = theme;
    let clearColor = 0x0f172a;
    switch (theme) {
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
  }"""
sr = re.sub(r'  setTheme\(theme\).*?this._renderer.setClearColor\(.*?\);\n  }', theme_mapping, sr, flags=re.DOTALL)

with open('js/renderer/scene-renderer.js', 'w') as f:
    f.write(sr)
