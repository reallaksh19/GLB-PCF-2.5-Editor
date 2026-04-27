import re

with open('js/vendor/buildDraftingScene.js', 'r') as f:
    c = f.read()

bowtie_logic = """  const geo1 = new THREE.ConeGeometry(radius * 1.5, length, 12);
  const geo2 = new THREE.ConeGeometry(radius * 1.5, length, 12);
  geo1.rotateX(-Math.PI / 2);
  geo2.rotateX(Math.PI / 2);
  geo1.translate(0, 0, length / 2);
  geo2.translate(0, 0, -length / 2);"""

c = re.sub(
    r'  const geo1 = new THREE\.ConeGeometry.*?geo2\.translate\(0, 0, -length / 2\);',
    bowtie_logic,
    c,
    flags=re.DOTALL
)

with open('js/vendor/buildDraftingScene.js', 'w') as f:
    f.write(c)
