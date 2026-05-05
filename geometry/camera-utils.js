/**
 * camera-utils.js — Shared camera module for 3D viewers.
 * Extracts orthographic setup, fitting logic, target positioning, damping, and near/far clipping policies.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function setupCamera(containerWidth, containerHeight) {
    const aspect = containerWidth / (containerHeight || 1);
    const frustum = 5000;

    const camera = new THREE.OrthographicCamera(
        -frustum * aspect, frustum * aspect,
        frustum, -frustum,
        -50000, 50000
    );

    camera.position.set(5000, 5000, 5000);
    camera.lookAt(0, 0, 0);

    return camera;
}

export function setupControls(camera, rendererDomElement, objectGroupRef) {
    const controls = new OrbitControls(camera, rendererDomElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    // Refresh clipping planes on every orbit/pan so geometry never disappears
    controls.addEventListener('change', () => {
        const group = objectGroupRef();
        if (group) {
            const box = new THREE.Box3().setFromObject(group);
            if (!box.isEmpty()) {
                const sz = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(sz.x, sz.y, sz.z, 1);
                camera.near = -maxDim * 20;
                camera.far = maxDim * 20;
                camera.updateProjectionMatrix();
            }
        }
    });

    return controls;
}

export function resizeCamera(camera, containerWidth, containerHeight, currentMaxDim = 5000) {
    if (!camera.isOrthographicCamera) return; // Only handling ortho resizing natively here

    const aspect = containerWidth / (containerHeight || 1);
    const half = currentMaxDim * 0.8;

    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
}

/**
 * Re-centres camera on geometry — matches PCF Studio "fitCamera" behavior.
 */
export function fitCamera(camera, controls, objectGroup, containerWidth, containerHeight) {
    if (!objectGroup) return;

    const box = new THREE.Box3().setFromObject(objectGroup);
    if (box.isEmpty()) return;

    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Update orthographic frustum
    const aspect = containerWidth / (containerHeight || 1);
    const half = maxDim * 0.8;

    if (camera.isOrthographicCamera) {
        camera.left = -half * aspect;
        camera.right = half * aspect;
        camera.top = half;
        camera.bottom = -half;
        camera.near = -maxDim * 20;
        camera.far = maxDim * 20;

        camera.position.set(
            centre.x + maxDim,
            centre.y + maxDim,
            centre.z + maxDim
        );
    } else {
        // Perspective fallback for shared logic if needed
        const dist = maxDim / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        camera.position.set(
            centre.x + dist,
            centre.y + dist,
            centre.z + dist
        );
    }

    camera.lookAt(centre);
    camera.updateProjectionMatrix();

    if (controls) {
        controls.target.copy(centre);
        controls.update();
    }
}
