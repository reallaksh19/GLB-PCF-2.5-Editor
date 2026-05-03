const fs = require('fs');

let content = fs.readFileSync('js/ui/heatmap.js', 'utf-8');
content = content.replace(/m\.color\.setHex\(colorStr\);/g, `m.color.setHex(colorStr);`);
content = content.replace(/m\.color\.setStyle\(colorStr\);/g, `m.color.setStyle(colorStr);`);
// Instead of messing with material color directly, we should clone material
content = content.replace(/if \(Array\.isArray\(obj\.material\)\) \{[\s\S]*?else \{[\s\S]*?applyColor\(obj\.material\);[\s\S]*?\}/, `if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(m => m.clone());
        obj.material.forEach(applyColor);
      } else {
        obj.material = obj.material.clone();
        applyColor(obj.material);
      }`);
fs.writeFileSync('js/ui/heatmap.js', content);
