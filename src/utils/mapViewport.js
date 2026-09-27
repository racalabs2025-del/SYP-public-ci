// Shared input geometry keeps trackpads, mouse wheels and drag controls consistent.
export function wheelScale(deltaY, deltaMode = 0, pageHeight = 620) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
  return Math.exp(-Math.max(-120, Math.min(120, pixels)) * 0.002);
}

export function svgPointFromClient(svg, clientX, clientY) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return { x: 600, y: 310 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

export function clampMapPan(x, y, zoom) {
  return {
    x: Math.max(-1200 * (zoom - 1), Math.min(0, x)),
    y: Math.max(-620 * (zoom - 1), Math.min(0, y)),
  };
}

export function zoomViewport(view, factor, anchor = { x: 600, y: 310 }) {
  const zoom = Math.max(1, Math.min(6, view.zoom * factor));
  if (zoom === view.zoom) return view;
  const ratio = zoom / view.zoom;
  return {
    zoom,
    pan: clampMapPan(anchor.x - (anchor.x - view.pan.x) * ratio, anchor.y - (anchor.y - view.pan.y) * ratio, zoom),
  };
}

// Keep the map point between two fingers under their moving midpoint.
export function pinchViewport(view, factor, start, current) {
  const zoom = Math.max(1, Math.min(6, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    zoom,
    pan: clampMapPan(
      current.x - (start.x - view.pan.x) * ratio,
      current.y - (start.y - view.pan.y) * ratio,
      zoom,
    ),
  };
}

// Work in screen pixels so SVG letterboxing, padding and resizing do not shift the card.
export function mapTooltipPosition(anchor, card, bounds, inset = 10) {
  const left = Math.max(inset, Math.min(bounds.width - card.width - inset, anchor.x - card.width / 2));
  const above = anchor.y - card.height - 16;
  const top = Math.max(inset, Math.min(bounds.height - card.height - inset, above >= inset ? above : anchor.y + 16));
  return { left, top };
}
