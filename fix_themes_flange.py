import re

with open('js/vendor/buildDraftingScene.js', 'r') as f:
    c = f.read()

# Make sure COLORS are updated correctly
colors_def = """const COLORS = {
  NavisDark: { pipe: 0xb8c4d2, flange: 0x8899aa, valve: 0x6699aa, generic: 0x9aabb8 },
  DraftLight:  { pipe: 0x2d3748, flange: 0x1a2535, valve: 0x334455, generic: 0x3d4f62 },
  DraftDark:   { pipe: 0xcbd5e1, flange: 0x94a3b8, valve: 0x64748b, generic: 0x475569 },
  Blueprint:   { pipe: 0xffffff, flange: 0xbfdbfe, valve: 0x93c5fd, generic: 0x60a5fa },
  MonochromeTechnical: { pipe: 0xf5f5f5, flange: 0xd4d4d4, valve: 0xa3a3a3, generic: 0x737373 },
  HighContrastReview:  { pipe: 0x00ff00, flange: 0xffff00, valve: 0xff00ff, generic: 0xffffff }
};
"""
c = re.sub(r'const COLORS = \{.*?\};\n', colors_def, c, flags=re.DOTALL)

# Refine flange geometry (make it look more realistic like two rings connected by bolts or just a clearer structure)
# The current flange is just two cylinders. Let's make it a bit more detailed but simple enough for drawing.
flange_logic = """export function buildFlangeDraft(comp, theme) {
  const bore = comp.geometry.bore;
  const OD = mmToScene(minBore(bore) * 1.8);
  const ID = mmToScene(minBore(bore));
  const thickness = mmToScene(minBore(bore) * 0.2);

  // Outer flange body
  const geo1 = new THREE.CylinderGeometry(OD / 2, OD / 2, thickness, 24);
  const mat  = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'flange') });

  const m1 = new THREE.Mesh(geo1, mat);
  const m2 = new THREE.Mesh(geo1, mat);

  // Center pipe stub to connect them
  const stubGeo = new THREE.CylinderGeometry(ID / 2, ID / 2, thickness * 2, 16);
  const mStub = new THREE.Mesh(stubGeo, mat);

  m1.position.set(0, thickness / 2, 0);
  m2.position.set(0, -thickness / 2, 0);
  mStub.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(m1, m2, mStub);

  const origin = toVec3(comp.geometry.origin);
  group.position.copy(origin);

  // Orient flange if we have ep1/ep2
  if (comp.geometry.ep1 && comp.geometry.ep2) {
      const ep1V = toVec3(comp.geometry.ep1);
      const ep2V = toVec3(comp.geometry.ep2);
      orientCylinder(group, ep1V, ep2V);
      // reposition to origin since orientCylinder just sets quaternion
      group.position.copy(origin);
  } else if (comp.geometry.ep1) {
      group.position.copy(toVec3(comp.geometry.ep1));
  }

  setUserData(group, comp);
  return group;
}"""
c = re.sub(r'export function buildFlangeDraft\(comp, theme\).*?return group;\n}', flange_logic, c, flags=re.DOTALL)

with open('js/vendor/buildDraftingScene.js', 'w') as f:
    f.write(c)
