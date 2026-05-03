/**
 * js/tabs/design-tab.js
 * Mounts the DesignCanvas React component into the Design tab panel.
 */

import { createRoot } from 'react-dom/client';
import React from 'react';
import { DesignCanvas, DCSection, DCArtboard } from './design-canvas.js';

const e = React.createElement;

let _root = null;

export function initDesignTab() {
  const mountEl = document.getElementById('design-canvas-root');
  if (!mountEl) {
    console.warn('[design-tab] Missing #design-canvas-root');
    return;
  }

  _root = createRoot(mountEl);
  _root.render(
    e(DesignCanvas, null,
      e(DCSection, { title: 'Piping Layouts' },
        e(DCArtboard, { id: 'sheet-1', label: 'Sheet 1', width: 840, height: 594 }),
        e(DCArtboard, { id: 'sheet-2', label: 'Sheet 2', width: 840, height: 594 })
      )
    )
  );
}

export function destroyDesignTab() {
  if (_root) {
    _root.unmount();
    _root = null;
  }
}
