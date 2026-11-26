// Geometry of the drawings in the screenshot editor: bounds, hit testing,
// selection handles, moving and resizing. All coordinates are in image pixels.
// Objects are never changed in place: every function returns a new object (needed for undo).

const SEGMENT_TYPES = Object.freeze(['line', 'arrow']);
const BOX_HANDLES = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
// Text keeps its proportions, so it is resized only by the corners.
const CORNER_HANDLES = Object.freeze(['nw', 'ne', 'se', 'sw']);
const MIN_TEXT_SCALE = 0.1;
const MIN_FONT_SIZE = 6;

const measureContext = new OffscreenCanvas(1, 1).getContext('2d');

export function getTextFont(fontSize) {
  return `bold ${fontSize}px Arial, sans-serif`;
}

export function isSegment(object) {
  return SEGMENT_TYPES.includes(object.type);
}

export function normalizeRect(object) {
  return {
    x: Math.min(object.x1, object.x2),
    y: Math.min(object.y1, object.y2),
    width: Math.abs(object.x2 - object.x1),
    height: Math.abs(object.y2 - object.y1)
  };
}

function getTextWidth(object) {
  measureContext.font = getTextFont(object.fontSize);
  return measureContext.measureText(object.text).width;
}

function getPointsBounds(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top};
}

export function getObjectBounds(object) {
  if (object.type === 'pen') {
    return getPointsBounds(object.points);
  }

  if (object.type === 'text') {
    return {x: object.x, y: object.y, width: getTextWidth(object), height: object.fontSize};
  }

  return normalizeRect(object);
}

function getHandlePosition(bounds, name) {
  const x = name.includes('w') ? bounds.x : name.includes('e') ? bounds.x + bounds.width : bounds.x + bounds.width / 2;
  const y = name.includes('n') ? bounds.y : name.includes('s') ? bounds.y + bounds.height : bounds.y + bounds.height / 2;
  return {x, y};
}

// Squares the user can drag: two ends for line / arrow, the frame corners and sides for the rest.
export function getHandles(object) {
  if (isSegment(object)) {
    return [
      {name: 'start', x: object.x1, y: object.y1},
      {name: 'end', x: object.x2, y: object.y2}
    ];
  }

  const bounds = getObjectBounds(object);
  const names = object.type === 'text' ? CORNER_HANDLES : BOX_HANDLES;
  return names.map(name => ({name, ...getHandlePosition(bounds, name)}));
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSquared));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function isInsideRect(point, rect, margin) {
  return point.x >= rect.x - margin && point.x <= rect.x + rect.width + margin
    && point.y >= rect.y - margin && point.y <= rect.y + rect.height + margin;
}

// Rectangles and ellipses are picked by their outline, so a big frame
// does not block clicks on the smaller drawings inside it.
// Text and blur are picked anywhere inside.
export function hitTestObject(object, point, tolerance) {
  const margin = tolerance + (object.lineWidth || 0) / 2;

  if (isSegment(object)) {
    return distanceToSegment(point.x, point.y, object.x1, object.y1, object.x2, object.y2) <= margin;
  }

  if (object.type === 'pen') {
    const {points} = object;

    if (points.length === 1) {
      return Math.hypot(point.x - points[0][0], point.y - points[0][1]) <= margin;
    }

    return points.slice(1).some(([x, y], index) => distanceToSegment(point.x, point.y, points[index][0], points[index][1], x, y) <= margin);
  }

  const bounds = getObjectBounds(object);

  if (object.type === 'rect') {
    const inner = {x: bounds.x + margin, y: bounds.y + margin, width: bounds.width - margin * 2, height: bounds.height - margin * 2};
    const isInsideInner = inner.width > 0 && inner.height > 0 && isInsideRect(point, inner, 0);
    return isInsideRect(point, bounds, margin) && !isInsideInner;
  }

  if (object.type === 'ellipse') {
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;

    if (radiusX < 1 || radiusY < 1) {
      return isInsideRect(point, bounds, margin);
    }

    const distance = Math.hypot((point.x - bounds.x - radiusX) / radiusX, (point.y - bounds.y - radiusY) / radiusY);
    return Math.abs(distance - 1) * Math.min(radiusX, radiusY) <= margin;
  }

  return isInsideRect(point, bounds, tolerance);
}

export function translateObject(object, deltaX, deltaY) {
  if (object.type === 'pen') {
    return {...object, points: object.points.map(([x, y]) => [x + deltaX, y + deltaY])};
  }

  if (object.type === 'text') {
    return {...object, x: object.x + deltaX, y: object.y + deltaY};
  }

  return {...object, x1: object.x1 + deltaX, y1: object.y1 + deltaY, x2: object.x2 + deltaX, y2: object.y2 + deltaY};
}

function resizeText(object, bounds, handle, point) {
  const newHeight = handle.includes('n') ? bounds.y + bounds.height - point.y : point.y - bounds.y;
  const scale = Math.max(MIN_TEXT_SCALE, newHeight / bounds.height, MIN_FONT_SIZE / object.fontSize);
  const newWidth = bounds.width * scale;

  return {
    ...object,
    fontSize: object.fontSize * scale,
    // The opposite corner stays in place.
    x: handle.includes('w') ? bounds.x + bounds.width - newWidth : bounds.x,
    y: handle.includes('n') ? bounds.y + bounds.height - object.fontSize * scale : bounds.y
  };
}

// Stretches the object so that the dragged handle follows the pointer.
// `object` is the object as it was when the drag started.
export function resizeObject(object, handle, point) {
  if (handle === 'start') {
    return {...object, x1: point.x, y1: point.y};
  }

  if (handle === 'end') {
    return {...object, x2: point.x, y2: point.y};
  }

  const bounds = getObjectBounds(object);

  if (object.type === 'text') {
    return resizeText(object, bounds, handle, point);
  }

  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  if (handle.includes('w')) {
    left = point.x;
  }
  if (handle.includes('e')) {
    right = point.x;
  }
  if (handle.includes('n')) {
    top = point.y;
  }
  if (handle.includes('s')) {
    bottom = point.y;
  }

  if (object.type === 'pen') {
    // Every point keeps its relative position inside the frame (dragging past the opposite side mirrors the drawing).
    const scaleX = bounds.width > 0 ? (right - left) / bounds.width : 1;
    const scaleY = bounds.height > 0 ? (bottom - top) / bounds.height : 1;
    return {
      ...object,
      points: object.points.map(([x, y]) => [left + (x - bounds.x) * scaleX, top + (y - bounds.y) * scaleY])
    };
  }

  return {...object, x1: left, y1: top, x2: right, y2: bottom};
}
