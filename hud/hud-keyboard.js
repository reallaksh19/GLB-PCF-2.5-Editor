export function installHudKeyboard(root, handlers = {}) {
  const onKeyDown = (ev) => {
    if (ev.defaultPrevented) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    const target = ev.target;
    const isTypingTarget = target && /input|textarea|select/i.test(target.tagName || '');
    const insideHud = !!(root && target && root.contains(target));

    if (isTypingTarget && !insideHud && ev.key !== 'Escape') return;

    const key = String(ev.key || '').toLowerCase();

    if (key === 'escape') {
      handlers.cancel?.();
      return;
    }

    if (key === 'enter') {
      handlers.commit?.();
      return;
    }

    if (key === 'l') return handlers.line?.();
    if (key === 'v') return handlers.insert?.('VALVE');
    if (key === 'f') return handlers.insert?.('FLANGE');
    if (key === 'e') return handlers.insert?.('ELBOW');
    if (key === 't') return handlers.insert?.('TEE');
    if (key === 's') return handlers.insert?.('SUPPORT');
    if (key === 'r') return handlers.insert?.('REDUCER');
    if (ev.shiftKey && key === 'b') return handlers.autoBend?.();
    if (ev.shiftKey && key === 't') return handlers.autoTee?.();

    if (key === 'x' || key === 'y' || key === 'z') return handlers.axis?.(key.toUpperCase());
    if (key === '+' || key === '=') return handlers.sign?.(1);
    if (key === '-' || key === '_') return handlers.sign?.(-1);
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
