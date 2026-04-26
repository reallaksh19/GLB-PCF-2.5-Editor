import re

with open('geometry/symbols.js', 'r') as f:
    c = f.read()

# Fix the internal offsets that relied on group.position being at the center
c = c.replace("pts.push(upDir.clone().multiplyScalar(-od / 2));", "pts.push(upDir.clone().multiplyScalar(0));")
c = c.replace("pts.push(upDir.clone().multiplyScalar(-od / 2 + shaftLen));", "pts.push(upDir.clone().multiplyScalar(shaftLen));")
c = c.replace("head.position.copy(upDir).multiplyScalar(-od / 2 + shaftLen + headLen / 2);", "head.position.copy(upDir).multiplyScalar(shaftLen + headLen / 2);")

with open('geometry/symbols.js', 'w') as f:
    f.write(c)
