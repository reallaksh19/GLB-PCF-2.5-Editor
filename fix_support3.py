import re

with open('geometry/symbols.js', 'r') as f:
    c = f.read()

# Make arrows start at 0 instead of -od*x since the group is already translated
c = c.replace("group.add(makeArrow(upDir, -od * 0.45, od, MAT_SUPPORT));", "group.add(makeArrow(upDir, 0, od, MAT_SUPPORT));")
c = c.replace("group.add(makeArrow(rightDir, -od * 0.9, od, MAT_SUPPORT));", "group.add(makeArrow(rightDir, 0, od, MAT_SUPPORT));")
c = c.replace("group.add(makeArrow(leftDir, -od * 0.9, od, MAT_SUPPORT));", "group.add(makeArrow(leftDir, 0, od, MAT_SUPPORT));")
c = c.replace("group.add(makeArrow(rightDir, -od * 0.7, od, MAT_SUPPORT));", "group.add(makeArrow(rightDir, 0, od, MAT_SUPPORT));")
c = c.replace("group.add(makeArrow(leftDir, -od * 0.7, od, MAT_SUPPORT));", "group.add(makeArrow(leftDir, 0, od, MAT_SUPPORT));")


with open('geometry/symbols.js', 'w') as f:
    f.write(c)
