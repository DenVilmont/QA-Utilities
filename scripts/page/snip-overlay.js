// Injected into the web page when the user chooses "Select area".
// Dims the page, shows a crosshair and the selection with its size,
// then reports the selected rectangle back to the side panel.
// This file is a plain script (not a module) because it runs inside the page.
(() => {
  const OVERLAY_ID = '__qa_utilities_snip_overlay__';
  const ACCENT_COLOR = '#b36531';
  const DIM_COLOR = 'rgba(0, 0, 0, 0.4)';
  const MIN_SELECTION_SIZE = 4;

  document.getElementById(OVERLAY_ID)?.__qaCancel?.();

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    userSelect: 'none'
  });

  function createPart(styles) {
    const element = document.createElement('div');
    Object.assign(element.style, {position: 'absolute', pointerEvents: 'none'}, styles);
    root.appendChild(element);
    return element;
  }

  // Four dark parts around the selection keep the selected area undimmed.
  const dimTop = createPart({background: DIM_COLOR, left: '0', top: '0', width: '100%', height: '100%'});
  const dimBottom = createPart({background: DIM_COLOR, left: '0', display: 'none'});
  const dimLeft = createPart({background: DIM_COLOR, left: '0', display: 'none'});
  const dimRight = createPart({background: DIM_COLOR, display: 'none'});
  const guideX = createPart({top: '0', height: '100%', width: '0', borderLeft: `1px dashed ${ACCENT_COLOR}`});
  const guideY = createPart({left: '0', width: '100%', height: '0', borderTop: `1px dashed ${ACCENT_COLOR}`});
  const selection = createPart({border: `1px solid ${ACCENT_COLOR}`, boxSizing: 'border-box', display: 'none'});
  const sizeLabel = createPart({
    background: ACCENT_COLOR,
    color: '#fff',
    font: '600 11px Arial, sans-serif',
    padding: '3px 6px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    display: 'none'
  });

  let start = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getRect(event) {
    const x1 = clamp(Math.min(start.x, event.clientX), 0, window.innerWidth);
    const y1 = clamp(Math.min(start.y, event.clientY), 0, window.innerHeight);
    const x2 = clamp(Math.max(start.x, event.clientX), 0, window.innerWidth);
    const y2 = clamp(Math.max(start.y, event.clientY), 0, window.innerHeight);
    return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
  }

  function px(value) {
    return `${value}px`;
  }

  function drawGuides(event) {
    guideX.style.left = px(event.clientX);
    guideY.style.top = px(event.clientY);
  }

  function drawSelection(rect) {
    Object.assign(dimTop.style, {height: px(rect.y)});
    Object.assign(dimBottom.style, {display: '', top: px(rect.y + rect.height), width: '100%', height: px(window.innerHeight - rect.y - rect.height)});
    Object.assign(dimLeft.style, {display: '', top: px(rect.y), width: px(rect.x), height: px(rect.height)});
    Object.assign(dimRight.style, {display: '', top: px(rect.y), left: px(rect.x + rect.width), width: px(window.innerWidth - rect.x - rect.width), height: px(rect.height)});
    Object.assign(selection.style, {display: '', left: px(rect.x), top: px(rect.y), width: px(rect.width), height: px(rect.height)});

    sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const labelTop = rect.y + rect.height + 26 > window.innerHeight ? rect.y - 24 : rect.y + rect.height + 4;
    Object.assign(sizeLabel.style, {display: '', left: px(clamp(rect.x, 0, window.innerWidth - 90)), top: px(clamp(labelTop, 0, window.innerHeight - 22))});
  }

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown, true);
    root.remove();
  }

  function finish(message) {
    cleanup();
    // Wait two frames so the overlay is gone from the screen before the side panel takes the screenshot.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chrome.runtime.sendMessage({type: 'qa-snip-result', ...message});
    }));
  }

  function onPointerDown(event) {
    if (event.button !== 0) {
      finish({status: 'cancelled'});
      return;
    }

    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    start = {x: event.clientX, y: event.clientY};
    guideX.style.display = 'none';
    guideY.style.display = 'none';
  }

  function onPointerMove(event) {
    if (!start) {
      drawGuides(event);
      return;
    }

    drawSelection(getRect(event));
  }

  function onPointerUp(event) {
    if (!start) {
      return;
    }

    const rect = getRect(event);

    if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
      finish({status: 'cancelled'});
      return;
    }

    finish({status: 'selected', rect, viewportWidth: window.innerWidth});
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish({status: 'cancelled'});
    }
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('keydown', onKeyDown, true);

  // Lets the side panel (or a second injection) remove the overlay without sending a result.
  root.__qaCancel = cleanup;

  document.documentElement.appendChild(root);
})();
