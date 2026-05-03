/**
 * Drag preview module.
 *
 * Manages temporary preview objects during drag interactions. In
 * production this would create translucent meshes and update them as
 * the mouse moves. This stub records preview state but does not
 * render anything.
 */

const previewState = {
  active: false,
  anchorId: null,
  startPoint: null,
  currentPoint: null
};

export function beginPreview(anchorId, startPoint) {
  previewState.active = true;
  previewState.anchorId = anchorId;
  previewState.startPoint = { ...startPoint };
  previewState.currentPoint = { ...startPoint };
}

export function updatePreview(currentPoint) {
  if (previewState.active) {
    previewState.currentPoint = { ...currentPoint };
  }
}

export function endPreview() {
  previewState.active = false;
  previewState.anchorId = null;
  previewState.startPoint = null;
  previewState.currentPoint = null;
}

export function getPreviewState() {
  return { ...previewState };
}