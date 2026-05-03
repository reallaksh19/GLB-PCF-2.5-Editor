import re

content = open("macro/macro-commands.js").read()

imports = """
import { validateMatrixInput } from './validate-matrix-input.js';
"""
content = content.replace("import { createMacroIR } from './macro-ir-contract.js';", "import { createMacroIR } from './macro-ir-contract.js';\n" + imports.strip())

new_commands = """
  register('POLYLINE', (args, ctx) => {
    // POLYLINE x1,y1,z1 x2,y2,z2 ... OR POLYLINE followed by matrix
    let points = [];
    if (args.length > 0) {
      points = args.map(arg => parseXYZ(arg, ctx));
    } else if (ctx.matrix) {
      const v = validateMatrixInput(ctx.matrix);
      if (!v.ok) throw new Error('Invalid matrix input for POLYLINE: ' + JSON.stringify(v.errors));
      points = v.points;
    } else {
      throw new Error('POLYLINE requires point arguments or matrix input');
    }

    if (points.length < 2) throw new Error('POLYLINE requires at least two valid points');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const opts = parseKV(args);
    const spec = { pipelineRef: opts.PIPELINE || ctx.pipeline || '' };

    const routeId = routeEngine.createPolyline(points, spec, { source: 'macro-polyline' });
    const route = routeEngine.getRoutes().find(r => r.id === routeId);
    if (!route) throw new Error('Failed to create POLYLINE route');

    const createdComps = (route.segments || []).map(seg => ({ id: seg.id, type: 'PIPE' }));
    return registerCompsResult(createdComps, ctx, `POLYLINE created route ${routeId} with ${route.segments.length} segments`);
  });

  register('SPLINE_GUIDE', (args, ctx) => {
    let points = [];
    if (args.length > 0) {
      points = args.map(arg => parseXYZ(arg, ctx));
    } else if (ctx.matrix) {
      const v = validateMatrixInput(ctx.matrix);
      if (!v.ok) throw new Error('Invalid matrix input for SPLINE_GUIDE: ' + JSON.stringify(v.errors));
      points = v.points;
    } else {
      throw new Error('SPLINE_GUIDE requires point arguments or matrix input');
    }

    if (points.length < 2) throw new Error('SPLINE_GUIDE requires at least two valid points');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const id = routeEngine.createGuide(points, 'SPLINE', { source: 'macro-spline-guide' });
    return { message: `SPLINE_GUIDE created: ${id}` };
  });

  register('STRETCH', (args, ctx) => {
    requireArgs(args, 2, 'STRETCH nodeId dx,dy,dz');
    const nodeId = String(args[0]);
    const delta = parseXYZ(args[1], ctx, 'route-delta');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('STRETCH requires an active route selection');

    routeEngine.stretchNode(activeRouteId, nodeId, delta, { source: 'macro-stretch' });
    return { message: `STRETCH applied to node ${nodeId}` };
  });

  register('ROTATE', (args, ctx) => {
    requireArgs(args, 3, 'ROTATE nodeId1,nodeId2,... angle pivotX,pivotY,pivotZ [AXIS=Z]');
    const nodeIds = String(args[0]).split(',').map(s => s.trim()).filter(Boolean);
    const angle = Number(args[1]);
    if (!Number.isFinite(angle)) throw new Error('ROTATE angle must be numeric');
    const pivot = parseXYZ(args[2], ctx);
    const opts = parseKV(args.slice(3));
    const axis = String(opts.AXIS || 'Z').toUpperCase();

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('ROTATE requires an active route selection');

    routeEngine.rotateNodes(activeRouteId, pivot, angle, axis, nodeIds, { source: 'macro-rotate' });
    return { message: `ROTATE applied to nodes ${nodeIds.join(', ')} by ${angle} degrees` };
  });

  register('BREAK', (args, ctx) => {
    requireArgs(args, 1, 'BREAK segmentId [x,y,z]');
    const segmentId = String(args[0]);
    let point = null;
    if (args[1]) {
      point = parseXYZ(args[1], ctx);
    }

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('BREAK requires an active route selection');

    routeEngine.breakSegment(activeRouteId, segmentId, point, { source: 'macro-break' });
    return { message: `BREAK applied to segment ${segmentId}` };
  });

  register('DELETE', (args, ctx) => {
    requireArgs(args, 1, 'DELETE segmentId|nodeId|routeId');
    const id = String(args[0]);
    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('DELETE requires an active route selection (for segment/node delete)');

    const state = routeEngine.getState();
    const route = (state.model?.routes || []).find(r => r.id === activeRouteId);

    let isSegment = route?.segments?.some(s => s.id === id);
    let isNode = route?.nodes?.some(n => n.id === id);

    if (isSegment) {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: activeRouteId, segmentId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to segment ${id}` };
    } else if (isNode) {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: activeRouteId, nodeId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to node ${id}` };
    } else {
       routeEngine.execute({ type: 'ROUTE_DELETE', payload: { routeId: id }, meta: { source: 'macro-delete' }});
       return { message: `DELETE applied to route ${id}` };
    }
  });

  register('MOVE', (args, ctx) => {
    requireArgs(args, 2, 'MOVE nodeId dx,dy,dz');
    const nodeId = String(args[0]);
    const delta = parseXYZ(args[1], ctx, 'route-delta');

    const routeEngine = ctx.getRouteEngine?.();
    if (!routeEngine) throw new Error('ROUTE engine not initialized');

    const activeRouteId = routeEngine.getState().selection?.activeRouteId;
    if (!activeRouteId) throw new Error('MOVE requires an active route selection');

    routeEngine.moveNode(activeRouteId, nodeId, delta, { source: 'macro-move' });
    return { message: `MOVE applied to node ${nodeId}` };
  });
"""

content = content.replace("export function registerBuiltinCommands() {", "export function registerBuiltinCommands() {\n" + new_commands)

open("macro/macro-commands.js", "w").write(content)
