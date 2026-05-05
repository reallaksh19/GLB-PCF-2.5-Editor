/**
 * hud/hud-line-command-parser.js
 * Thin HUD adapter over the shared editor draft command parser.
 */

import { resolveRouteSegmentInput } from '../editor/route-segment-input.js';

export function parseHudLineCommand(commandText, fromPoint, axisLock) {
  return resolveRouteSegmentInput(fromPoint, commandText, axisLock);
}
