// Takes screenshots of the active tab. Runs inside the side panel.
// Three modes: visible area, selected area and full page (scroll + stitch).

import {saveCapture} from './capture-store.js';
import {ToolError, assertSupportedPage} from './tab-access.js';

export const CAPTURE_MODES = Object.freeze({
  visible: 'visible',
  area: 'area',
  fullPage: 'fullPage'
});

// Chrome allows only ~2 captureVisibleTab calls per second.
const MIN_CAPTURE_INTERVAL_MS = 600;
const MAX_CAPTURE_RETRIES = 5;
// Browsers cannot create canvases taller than ~32k pixels.
const MAX_IMAGE_HEIGHT = 32000;

const SNIP_OVERLAY_ID = '__qa_utilities_snip_overlay__';

let lastCaptureAt = 0;
let pendingSnip = null;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function assertTabStillActive(tab) {
  const currentTab = await chrome.tabs.get(tab.id).catch(() => null);

  if (!currentTab || !currentTab.active || currentTab.windowId !== tab.windowId) {
    throw new ToolError('captureTabChanged');
  }
}

async function captureVisibleTabThrottled(windowId) {
  for (let attempt = 0; ; attempt += 1) {
    const waitTime = lastCaptureAt + MIN_CAPTURE_INTERVAL_MS - Date.now();

    if (waitTime > 0) {
      await delay(waitTime);
    }

    lastCaptureAt = Date.now();

    try {
      return await chrome.tabs.captureVisibleTab(windowId, {format: 'png'});
    } catch (error) {
      const isRateLimited = String(error?.message).includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND');

      if (!isRateLimited || attempt >= MAX_CAPTURE_RETRIES) {
        throw new ToolError('captureFailed', error?.message);
      }
    }
  }
}

async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

async function runInPage(tab, func, args = []) {
  try {
    const [injectionResult] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func, args});
    return injectionResult?.result;
  } catch (error) {
    throw new ToolError('pageRestricted', error?.message);
  }
}

function createMeta(tab, mode, width, height, scale, truncated = false) {
  return {
    mode,
    url: tab.url || '',
    title: tab.title || '',
    width,
    height,
    scale,
    truncated,
    createdAt: Date.now()
  };
}

async function canvasToPngBlob(canvas) {
  return canvas.convertToBlob({type: 'image/png'});
}

async function saveAndOpenEditor(tab, blob, meta) {
  const id = await saveCapture(blob, meta);
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`pages/capture.html?id=${encodeURIComponent(id)}`),
    index: tab.index + 1,
    windowId: tab.windowId
  });
  return id;
}

// ---------- Visible area ----------

export async function captureVisible(tab) {
  assertSupportedPage(tab);
  const dataUrl = await captureVisibleTabThrottled(tab.windowId);
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const meta = createMeta(tab, CAPTURE_MODES.visible, bitmap.width, bitmap.height, bitmap.width / (tab.width || bitmap.width));
  bitmap.close();
  return saveAndOpenEditor(tab, blob, meta);
}

// ---------- Selected area ----------

function waitForSnipResult(tab) {
  return new Promise(resolve => {
    function cleanup() {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.tabs.onActivated.removeListener(onTabActivated);
      pendingSnip = null;
    }

    function onMessage(message, sender) {
      if (message?.type !== 'qa-snip-result' || sender.tab?.id !== tab.id) {
        return;
      }

      cleanup();
      resolve(message);
    }

    function onTabUpdated(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'loading') {
        cleanup();
        resolve({status: 'cancelled'});
      }
    }

    function onTabActivated(activeInfo) {
      if (activeInfo.windowId === tab.windowId && activeInfo.tabId !== tab.id) {
        cancelPendingSnip();
      }
    }

    pendingSnip = {
      tab,
      cancel() {
        cleanup();
        resolve({status: 'cancelled'});
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onActivated.addListener(onTabActivated);
  });
}

// Removes the selection overlay from the page if the user starts another capture.
export function cancelPendingSnip() {
  if (!pendingSnip) {
    return;
  }

  const {tab} = pendingSnip;
  pendingSnip.cancel();
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: overlayId => document.getElementById(overlayId)?.__qaCancel?.(),
    args: [SNIP_OVERLAY_ID]
  }).catch(() => {});
}

// Returns null if the user cancelled the selection.
export async function captureArea(tab) {
  assertSupportedPage(tab);
  cancelPendingSnip();

  const resultPromise = waitForSnipResult(tab);

  try {
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['scripts/page/snip-overlay.js']});
  } catch (error) {
    pendingSnip?.cancel();
    throw new ToolError('pageRestricted', error?.message);
  }

  const result = await resultPromise;

  if (result.status !== 'selected') {
    return null;
  }

  await assertTabStillActive(tab);
  const bitmap = await dataUrlToBitmap(await captureVisibleTabThrottled(tab.windowId));
  const scale = bitmap.width / result.viewportWidth;
  const sourceX = Math.round(result.rect.x * scale);
  const sourceY = Math.round(result.rect.y * scale);
  const width = Math.max(1, Math.min(bitmap.width - sourceX, Math.round(result.rect.width * scale)));
  const height = Math.max(1, Math.min(bitmap.height - sourceY, Math.round(result.rect.height * scale)));

  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(bitmap, sourceX, sourceY, width, height, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToPngBlob(canvas);
  return saveAndOpenEditor(tab, blob, createMeta(tab, CAPTURE_MODES.area, width, height, scale));
}

// ---------- Full page ----------
// The three functions below are serialized and executed inside the page,
// so they must not use anything from this module.

function pagePrepareFullPage() {
  const STYLE_ID = '__qa_utilities_fullpage_style__';
  window.__qaFullPage?.restore?.();

  // Hide scrollbars so they do not appear in every stitched part.
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = 'html, body, * { scrollbar-width: none !important; scroll-behavior: auto !important; }'
    + ' *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }';
  document.documentElement.appendChild(style);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollingElement = document.scrollingElement || document.documentElement;
  const documentHeight = Math.max(scrollingElement.scrollHeight, document.body?.scrollHeight || 0);
  let target = null;

  // Many web apps (Angular, etc.) do not scroll the window but an inner container.
  // In that case use the biggest visible scrollable element.
  if (documentHeight <= viewportHeight + 2) {
    let bestArea = 0;

    for (const element of document.querySelectorAll('body *')) {
      if (element.scrollHeight <= element.clientHeight + 2 || element.clientHeight < 50) {
        continue;
      }

      if (!/(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
      const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      const area = visibleWidth > 0 && visibleHeight > 0 ? visibleWidth * visibleHeight : 0;

      if (area > bestArea) {
        bestArea = area;
        target = element;
      }
    }
  }

  const hiddenElements = [];
  const state = {
    target,
    windowX: window.scrollX,
    windowY: window.scrollY,
    targetTop: target ? target.scrollTop : 0,
    floatingHidden: false,
    hideFloatingElements() {
      if (state.floatingHidden) {
        return;
      }

      state.floatingHidden = true;
      const candidates = target ? target.querySelectorAll('*') : document.querySelectorAll('body *');

      for (const element of candidates) {
        const position = getComputedStyle(element).position;

        if ((position === 'fixed' || position === 'sticky') && !element.contains(target)) {
          hiddenElements.push({
            element,
            value: element.style.getPropertyValue('visibility'),
            priority: element.style.getPropertyPriority('visibility')
          });
          element.style.setProperty('visibility', 'hidden', 'important');
        }
      }
    },
    restore() {
      hiddenElements.forEach(({element, value, priority}) => {
        if (value) {
          element.style.setProperty('visibility', value, priority);
        } else {
          element.style.removeProperty('visibility');
        }
      });
      hiddenElements.length = 0;
      document.getElementById(STYLE_ID)?.remove();

      if (target) {
        target.scrollTop = state.targetTop;
      }

      window.scrollTo(state.windowX, state.windowY);
      delete window.__qaFullPage;
    }
  };

  window.__qaFullPage = state;

  if (!target) {
    window.scrollTo(0, 0);
    return {
      viewportWidth,
      viewportHeight,
      band: {left: 0, top: 0, width: viewportWidth, height: viewportHeight},
      maxScroll: Math.max(0, documentHeight - viewportHeight)
    };
  }

  target.scrollTop = 0;
  const rect = target.getBoundingClientRect();
  const left = Math.max(0, rect.left + target.clientLeft);
  const top = Math.max(0, rect.top + target.clientTop);
  const right = Math.min(viewportWidth, rect.left + target.clientLeft + target.clientWidth);
  const bottom = Math.min(viewportHeight, rect.top + target.clientTop + target.clientHeight);

  return {
    viewportWidth,
    viewportHeight,
    band: {left, top, width: right - left, height: bottom - top},
    maxScroll: Math.max(0, target.scrollHeight - target.clientHeight)
  };
}

async function pageScrollFullPage(position, hideFloating) {
  const state = window.__qaFullPage;

  if (hideFloating) {
    state.hideFloatingElements();
  }

  if (state.target) {
    state.target.scrollTop = position;
  } else {
    window.scrollTo(0, position);
  }

  // Let the page repaint (and lazy content start loading) before the screenshot.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 150));

  return state.target ? state.target.scrollTop : window.scrollY;
}

function pageRestoreFullPage() {
  window.__qaFullPage?.restore?.();
}

export async function captureFullPage(tab, onProgress = () => {}) {
  assertSupportedPage(tab);
  const layout = await runInPage(tab, pagePrepareFullPage);
  let blob;
  let meta;

  try {
    const {viewportHeight, band} = layout;
    const step = Math.max(1, Math.floor(band.height));
    const bandBottom = band.top + band.height;

    // First part: also gives the image scale (device pixels per CSS pixel).
    // Scrolling to 0 again waits until the page has repainted without scrollbars.
    await runInPage(tab, pageScrollFullPage, [0, false]);
    await assertTabStillActive(tab);
    const firstBitmap = await dataUrlToBitmap(await captureVisibleTabThrottled(tab.windowId));
    const scale = firstBitmap.width / layout.viewportWidth;

    let maxScroll = layout.maxScroll;
    let truncated = false;
    const maxScrollForHeight = Math.floor(MAX_IMAGE_HEIGHT / scale) - viewportHeight;

    if (maxScroll > maxScrollForHeight) {
      maxScroll = Math.max(0, maxScrollForHeight);
      truncated = true;
    }

    const positions = [];
    for (let position = step; position < maxScroll + step; position += step) {
      positions.push(Math.min(position, maxScroll));
      if (position >= maxScroll) {
        break;
      }
    }

    const totalParts = positions.length + 1;
    onProgress(1, totalParts);

    const width = firstBitmap.width;
    const height = Math.round((viewportHeight + maxScroll) * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    const toPx = value => Math.round(value * scale);

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    // Top of the page (and the first part of the scrolling area) in full width.
    context.drawImage(firstBitmap, 0, 0, width, toPx(bandBottom), 0, 0, width, toPx(bandBottom));

    let lastBitmap = firstBitmap;
    let lastPosition = 0;

    for (let index = 0; index < positions.length; index += 1) {
      const actualPosition = await runInPage(tab, pageScrollFullPage, [positions[index], true]);

      if (actualPosition <= lastPosition) {
        break;
      }

      await assertTabStillActive(tab);
      const bitmap = await dataUrlToBitmap(await captureVisibleTabThrottled(tab.windowId));
      context.drawImage(
        bitmap,
        toPx(band.left), toPx(band.top), toPx(band.width), Math.ceil(band.height * scale),
        toPx(band.left), toPx(band.top + actualPosition), toPx(band.width), Math.ceil(band.height * scale)
      );

      if (lastBitmap !== bitmap) {
        lastBitmap.close();
      }

      lastBitmap = bitmap;
      lastPosition = actualPosition;
      onProgress(index + 2, totalParts);
    }

    // Part of the page below the scrolling container (only for inner containers).
    const bottomHeight = viewportHeight - bandBottom;

    if (!truncated && bottomHeight > 0) {
      context.drawImage(
        lastBitmap,
        0, toPx(bandBottom), width, toPx(bottomHeight),
        0, toPx(bandBottom + lastPosition), width, toPx(bottomHeight)
      );
    }

    lastBitmap.close();

    const finalHeight = Math.min(height, Math.round((bandBottom + lastPosition + (truncated ? 0 : bottomHeight)) * scale));
    const finalCanvas = finalHeight < height ? cropCanvasHeight(canvas, finalHeight) : canvas;
    blob = await canvasToPngBlob(finalCanvas);
    meta = createMeta(tab, CAPTURE_MODES.fullPage, finalCanvas.width, finalCanvas.height, scale, truncated);
  } finally {
    // Give the page back to the user (also after an error) before the editor tab opens.
    await runInPage(tab, pageRestoreFullPage).catch(() => {});
  }

  return saveAndOpenEditor(tab, blob, meta);
}

function cropCanvasHeight(canvas, height) {
  const croppedCanvas = new OffscreenCanvas(canvas.width, height);
  croppedCanvas.getContext('2d').drawImage(canvas, 0, 0);
  return croppedCanvas;
}
