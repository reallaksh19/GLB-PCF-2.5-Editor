/*
 * formats/gltf/gltf-disposal-manager.js
 *
 * Manage disposal of glTF resources.  In Three.js a disposal
 * manager clears geometries, materials and textures when a scene
 * is unloaded to avoid GPU memory leaks.  This simplified
 * implementation records objects and provides a dispose function
 * that resets arrays and counts disposed items.  It emits
 * diagnostics summarizing how many resources were disposed.
 */

/**
 * A disposal manager tracks objects that need to be released and
 * provides a method to dispose of them.  For the Wave 2
 * implementation we record counts of geometries, materials and
 * textures disposed rather than interacting with WebGL directly.
 */
export class GltfDisposalManager {
  constructor() {
    this.reset();
  }

  /**
   * Register a mesh’s resources for disposal.  In a full
   * implementation this would track geometries, materials and
   * textures.  Here we simply count them.
   *
   * @param {Object} mesh The mesh whose resources to track.
   */
  track(mesh) {
    if (!mesh || typeof mesh !== 'object') return;
    if (mesh.geometry) this._geometries.push(mesh.geometry);
    if (mesh.material) this._materials.push(mesh.material);
    if (mesh.material && mesh.material.map) this._textures.push(mesh.material.map);
  }

  /**
   * Dispose of all tracked resources.  Clears the internal arrays
   * and returns a diagnostics summary.
   *
   * @returns {Object} Diagnostics about disposed resources.
   */
  disposeAll() {
    const summary = {
      disposedGeometries: this._geometries.length,
      disposedMaterials: this._materials.length,
      disposedTextures: this._textures.length
    };
    this.reset();
    return summary;
  }

  /**
   * Reset the internal lists.  Called on construction and after
   * disposal.
   */
  reset() {
    this._geometries = [];
    this._materials = [];
    this._textures = [];
  }
}