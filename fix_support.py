import re

with open('geometry/symbols.js', 'r') as f:
    c = f.read()

# Modify `createSupportSymbol` to push the support downwards relative to its pipe
support_logic = """export function createSupportSymbol(pos, type, pipeAxis, odInMM) {
    if (!type || type === 'UNKNOWN') return null;
    const group = new THREE.Group();
    const p = toThree(pos);

    // Apply global scale
    const scale = state.viewerSettings.restraintSymbolScale || 1.0;
    group.scale.set(scale, scale, scale);

    // Scale OD to scene units. Minimum viable OD for symbol proportion if missing.
    let od = (odInMM || 100) * SCALE;

    // Fallback axis if none provided
    const axis = pipeAxis ? pipeAxis.clone().normalize() : new THREE.Vector3(1, 0, 0);

    // Up axis based on convention. If scene is rotated, World Up is Three's Y.
    const isZup = state.viewerSettings.axisConvention === 'Z-up';
    const upAxis = isZup ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0); // World Y is up in both due to scene rotation

    // Lateral direction
    let lateral = new THREE.Vector3().crossVectors(axis, upAxis);
    if (lateral.length() < 0.01) {
        // pipe is vertical, pick arbitrary lateral
        lateral.set(1, 0, 0);
    }
    lateral.normalize();

    const leftDir = lateral.clone().negate();
    const rightDir = lateral.clone();
    const upDir = upAxis.clone();

    // Offset the position to sit below the pipe surface
    p.addScaledVector(upDir, -od / 2);
    group.position.copy(p);
"""

# Replace until `const leftDir` mapping downwards
c = re.sub(
    r"export function createSupportSymbol\(pos, type, pipeAxis, odInMM\).*?const upDir = upAxis.clone\(\);\n",
    support_logic,
    c,
    flags=re.DOTALL
)

with open('geometry/symbols.js', 'w') as f:
    f.write(c)
