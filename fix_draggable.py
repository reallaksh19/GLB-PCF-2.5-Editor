import re

with open('js/ui/toolbar.js', 'r') as f:
    c = f.read()

# Add drag capability to floating nav
drag_code = """
  // Floating nav dragging
  const floatNav = byId('floating-nav');
  const dragHandle = floatNav?.querySelector('.nav-drag-handle');
  if (floatNav && dragHandle) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      floatNav.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const style = window.getComputedStyle(floatNav);
      const matrix = new DOMMatrixReadOnly(style.transform);
      initialX = matrix.m41;
      initialY = matrix.m42;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
"""

c = c.replace("capabilities.ready('glb-export');", "capabilities.ready('glb-export');\n" + drag_code)

with open('js/ui/toolbar.js', 'w') as f:
    f.write(c)
