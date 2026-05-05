export const ANCHOR_ROLE_CONTRACT_VERSION = 'M0-ANCHOR-ROLES-1.0.0';

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
  CONTROL_POINT: 'CONTROL_POINT',
  FIT_POINT: 'FIT_POINT',
});

export const TopologyEligibleAnchorRoles = Object.freeze([
  AnchorRoles.EP1,
  AnchorRoles.EP2,
  AnchorRoles.RUN_IN,
  AnchorRoles.RUN_OUT,
  AnchorRoles.BRANCH_OUT,
]);

export function isKnownAnchorRole(role) {
  return Object.values(AnchorRoles).includes(String(role || ''));
}

export function isTopologyEligibleAnchorRole(role) {
  return TopologyEligibleAnchorRoles.includes(String(role || ''));
}
