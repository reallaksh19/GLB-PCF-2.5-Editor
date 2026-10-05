import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from 'acorn';

const JS = /\.(?:mjs|cjs|js)$/;
const DOM = new Set(['window', 'document', 'HTMLElement', 'Element', 'HTMLCanvasElement', 'WebGLRenderingContext', 'WebGL2RenderingContext']);
const SCALERS = new Set(['scalePointToMm', 'scaleLengthToMm']);

function filesBelow(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(file) : entry.isFile() && JS.test(file) ? [file] : [];
  });
}
function bindings(node, out) {
  if (!node) return;
  if (node.type === 'Identifier') out.add(node.name);
  else if (node.type === 'RestElement') bindings(node.argument, out);
  else if (node.type === 'AssignmentPattern') bindings(node.left, out);
  else if (node.type === 'ArrayPattern') node.elements.forEach(n => bindings(n, out));
  else if (node.type === 'ObjectPattern') node.properties.forEach(p => bindings(p.value || p.argument, out));
}
function localBindings(node) {
  const out = new Set();
  if (/Function/.test(node.type)) {
    bindings(node.id, out);
    node.params.forEach(p => bindings(p, out));
  }
  if (node.type === 'CatchClause') bindings(node.param, out);
  for (let statement of Array.isArray(node.body) ? node.body : []) {
    if (statement.type.startsWith('Export')) statement = statement.declaration || statement;
    if (statement.type === 'VariableDeclaration') statement.declarations.forEach(d => bindings(d.id, out));
    else if (statement.type === 'ImportDeclaration') statement.specifiers.forEach(s => bindings(s.local, out));
    else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') bindings(statement.id, out);
  }
  return out;
}
function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}
function isReference(parent, key) {
  if (!parent) return true;
  if ((parent.type === 'MemberExpression' || parent.type === 'Property') && key === (parent.type === 'Property' ? 'key' : 'property') && !parent.computed) return false;
  if ((/Declaration$/.test(parent.type) || parent.type === 'VariableDeclarator') && key === 'id') return false;
  if (/Function/.test(parent.type) && (key === 'params' || key === 'id')) return false;
  if (parent.type.startsWith('Import') && parent.type !== 'ImportExpression') return false;
  return true;
}
function inspect(ast, report, dependency) {
  function visit(node, parent, key, scopes) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Program' || node.type === 'BlockStatement' || /Function/.test(node.type) || node.type === 'CatchClause') scopes = [...scopes, localBindings(node)];
    if (node.type === 'ImportDeclaration' || ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source)) dependency(literal(node.source), node);
    else if (node.type === 'ImportExpression') dependency(literal(node.source), node);
    else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') dependency(literal(node.arguments[0]), node);
    if (node.type === 'Identifier' && SCALERS.has(node.name)) report(node, 'SOURCE_UNIT_SCALER', 'Native source fields cannot use legacy mm scalers');
    if (node.type === 'Identifier' && DOM.has(node.name) && isReference(parent, key) && !scopes.some(s => s.has(node.name))) report(node, 'DOM_DEPENDENCY', 'DOM global ' + node.name + ' prohibited');
    if (node.type === 'MemberExpression' && ['globalThis', 'self'].includes(node.object.name) && DOM.has(node.computed ? literal(node.property) : node.property.name)) report(node, 'DOM_DEPENDENCY', 'DOM access through a global object prohibited');
    for (const [childKey, child] of Object.entries(node)) {
      if (Array.isArray(child)) child.forEach(n => visit(n, node, childKey, scopes));
      else if (child && typeof child === 'object' && child.type) visit(child, node, childKey, scopes);
    }
  }
  visit(ast, null, null, []);
}
export function checkSourceBoundaries(root = process.cwd()) {
  root = path.resolve(root);
  const entries = ['formats/dxf/model', 'formats/dxf/parser', 'formats/dxf/writer', 'formats/dxf/render'].flatMap(p => filesBelow(path.join(root, p)));
  const visited = new Set(), violations = [], dependencyEdges = [];
  function scan(file) {
    file = fs.realpathSync(file);
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const report = (node, code, reason) => violations.push({ file: relative, line: node.loc?.start.line || 1, code, reason });
    let ast;
    try {
      ast = parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowReturnOutsideFunction: true });
    } catch (error) {
      report({ loc: error.loc ? { start: error.loc } : null }, 'INVALID_JAVASCRIPT', error.message);
      return;
    }
    inspect(ast, report, (specifier, node) => {
      if (specifier === null) { report(node, 'UNRESOLVED_DYNAMIC_IMPORT', 'Source dependencies require literal specifiers'); return; }
      const normalized = specifier.replaceAll('\\', '/');
      let target;
      if (normalized.startsWith('.') || path.isAbsolute(normalized)) {
        const candidate = path.resolve(path.dirname(file), normalized);
        target = [candidate, candidate + '.js', candidate + '.mjs', path.join(candidate, 'index.js')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      } else {
        try { target = createRequire(file).resolve(specifier); } catch {}
      }
      const resolved = target ? path.relative(root, target).replaceAll('\\', '/') : '';
      dependencyEdges.push({ from: relative, specifier, resolved: resolved || null });
      if (/^three(?:\/|$)/i.test(normalized) || /(?:^|\/)core\/ceg(?:\/|$)/i.test(normalized + '/' + resolved) || /(?:^|\/)domains\/piping(?:\/|$)/i.test(normalized + '/' + resolved)) {
        report(node, 'FORBIDDEN_IMPORT', 'Presentation/CEG/piping dependency prohibited: ' + specifier); return;
      }
      if (specifier.startsWith('node:') || (target && !path.isAbsolute(target))) { report(node, 'NODE_RUNTIME_IMPORT', 'Browser source packages cannot require Node APIs: ' + specifier); return; }
      if (!target) { report(node, 'UNRESOLVED_IMPORT', 'Cannot verify dependency: ' + specifier); return; }
      if (JS.test(target)) scan(target);
    });
  }
  entries.forEach(scan);
  return { scannedCount: entries.length, traversedCount: visited.size, status: entries.length === 0 ? 'NOT_APPLICABLE' : violations.length ? 'FAIL' : 'PASS', dependencyEdges, violations };
}
