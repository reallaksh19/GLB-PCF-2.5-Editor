/*
 * core/geometry/anchor-roles.js
 *
 * Central role vocabulary for CEG anchors and derived geometry views.
 * Keep this file dependency-light so parsers, HUD, macro and tests can share it.
 */

export const ANCHOR_ROLE_VERSION = '1.0.0-m0';

export const AnchorRoles = Object.freeze({
  EP1: 'EP1',
  EP2: 'EP2',
  CP: 'CP',
  ORIGIN: 'ORIGIN',
  RUN_IN: 'RUN_IN',
  RUN_OUT: 'RUN_OUT',
  BRANCH_OUT: 'BRANCH_OUT',
  SUPPORT_ORIGIN: 'SUPPORT_ORIGIN',
  ANNOTATION_ORIGIN: 'ANNOTATION_ORIGIN',
  GUIDE_POINT: 'GUIDE_POINT',
});

const ROLE_SET = new Set(Object.values(AnchorRoles));

export function normalizeAnchorRole(role, fallback = AnchorRoles.ORIGIN) {
  const value = String(role || '').trim().toUpperCase();
  return ROLE_SET.has(value) ? value : fallback;
}

export function isEndpointRole(role) {
  const r = normalizeAnchorRole(role, '');
  return r === AnchorRoles.EP1 || r === AnchorRoles.EP2 || r === AnchorRoles.RUN_IN || r === AnchorRoles.RUN_OUT || r === AnchorRoles.BRANCH_OUT;
}

export function isTopologyEligibleRole(role) {
  const r = normalizeAnchorRole(role, '');
  return isEndpointRole(r) || r === AnchorRoles.CP;
}
