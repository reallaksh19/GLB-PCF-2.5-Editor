const fs = require('fs');

let content = fs.readFileSync('js/ui/heatmap.js', 'utf-8');
content = content.replace(/m\.color\.setHex\(colorStr\);/g, `console.log("Setting HEX:", colorStr); m.color.setHex(colorStr); m.color.getHexString();`);
fs.writeFileSync('js/ui/heatmap.js', content);
