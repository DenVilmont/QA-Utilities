// Injected into web pages while a screen recording is running (see recorder-service.js):
// every click shows a short expanding circle, so the recording shows where the user clicked.
// The circle is a normal element of the page, so it is visible on the screen and in the recording.
// This file is a plain script (not a module) because it runs inside the page.
(() => {
  if (globalThis.qaUtilitiesClickHighlight) {
    return;
  }

  const SIZE_PX = 36;
  // Long enough to be seen in a recording at 15-30 frames per second.
  const DURATION_MS = 600;
  const COLOR = 'rgba(255, 152, 0, 0.95)';
  const FILL_COLOR = 'rgba(255, 152, 0, 0.25)';

  function showCircle(event) {
    // An unknown tag name: the page's own CSS rules for div / span do not touch it.
    const circle = document.createElement('qa-utilities-click');
    // !important protects the circle from the page's own CSS. transform and opacity are left out on purpose:
    // an !important value would win over the animation, and the circle would not grow or fade.
    circle.style.cssText = [
      'display: block',
      'position: fixed',
      `left: ${event.clientX - SIZE_PX / 2}px`,
      `top: ${event.clientY - SIZE_PX / 2}px`,
      `width: ${SIZE_PX}px`,
      `height: ${SIZE_PX}px`,
      'margin: 0',
      'padding: 0',
      'box-sizing: border-box',
      `border: 3px solid ${COLOR}`,
      'border-radius: 50%',
      `background: ${FILL_COLOR}`,
      'pointer-events: none',
      'z-index: 2147483647'
    ].map(rule => `${rule} !important`).join(';');

    document.documentElement.appendChild(circle);
    // Grows from a dot to full size, then keeps growing a little and fades out.
    circle.animate([
      {transform: 'scale(0.2)', opacity: 1},
      {transform: 'scale(1)', opacity: 1, offset: 0.35},
      {transform: 'scale(1.3)', opacity: 0}
    ], {duration: DURATION_MS, easing: 'ease-out'}).finished.finally(() => circle.remove());
  }

  // Capture phase: the circle appears even if the page stops the click from spreading.
  window.addEventListener('pointerdown', showCircle, {capture: true, passive: true});

  globalThis.qaUtilitiesClickHighlight = {
    stop() {
      window.removeEventListener('pointerdown', showCircle, {capture: true});
      delete globalThis.qaUtilitiesClickHighlight;
    }
  };
})();
