const PADDING = 12;
const LABEL_GAP = 6;
const MARKER_RADIUS = 7;
const MARKER_GAP = 14;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const byId = (a, b) => String(a.id).localeCompare(String(b.id), 'en');

function overlaps(a, b, gap = LABEL_GAP) {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
        && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function coversMarker(rect, point) {
    const x = clamp(point.x, rect.x, rect.x + rect.width);
    const y = clamp(point.y, rect.y, rect.y + rect.height);
    return (x - point.x) ** 2 + (y - point.y) ** 2 < MARKER_RADIUS ** 2;
}

function withinCanvas(rect, width, height) {
    return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        && rect.width > 0 && rect.height > 0 && rect.x >= PADDING && rect.y >= PADDING
        && rect.x + rect.width <= width - PADDING
        && rect.y + rect.height <= height - PADDING;
}

function candidates(point, width, height) {
    const labelWidth = Math.min(point.labelWidth, width - PADDING * 2);
    const labelHeight = point.labelHeight;
    const centeredX = clamp(point.x - labelWidth / 2, PADDING, width - PADDING - labelWidth);
    const centeredY = clamp(point.y - labelHeight / 2, PADDING, height - PADDING - labelHeight);
    return [
        { x: centeredX, y: point.y - MARKER_GAP - labelHeight, placement: 'top' },
        { x: centeredX, y: point.y + MARKER_GAP, placement: 'bottom' },
        { x: point.x + MARKER_GAP, y: centeredY, placement: 'right' },
        { x: point.x - MARKER_GAP - labelWidth, y: centeredY, placement: 'left' },
    ].map(candidate => ({ ...candidate, width: labelWidth, height: labelHeight }))
        .filter(rect => withinCanvas(rect, width, height));
}

/**
 * Places labels in screen pixels without moving their geographic markers.
 * Callers render the returned width with text overflow for very narrow canvases.
 * Priority 2 is a focused/hovered marker; priority 1 is the selected marker.
 * A baseline preferredLayout keeps ordinary labels still while a hovered name
 * appears; conflicting names temporarily disappear instead of jumping around.
 */
export function layoutNeighborhoodLabels({ points = [], width, height, zoom = 1, showLabels = true, reserved = [], preferredLayout }) {
    const result = new Map();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= PADDING * 2 || height <= PADDING * 2) return result;

    const visible = points.filter(point => point.id != null
        && Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)
        .map(point => ({
            ...point,
            priority: Number.isFinite(point.priority) ? point.priority : 0,
            labelWidth: Number.isFinite(point.labelWidth) && point.labelWidth > 0 ? point.labelWidth : 100,
            labelHeight: Number.isFinite(point.labelHeight) && point.labelHeight > 0 ? point.labelHeight : 28,
        })).sort(byId);
    const occupied = reserved.filter(rect => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        && rect.width > 0 && rect.height > 0);
    const anchors = [];

    const place = (point, onlyPreferred = false) => {
        const preferred = preferredLayout?.get(point.id);
        const choices = withinCanvas(preferred, width, height) ? [preferred] : [];
        if (!onlyPreferred) choices.push(...candidates(point, width, height));
        const available = choices
            .filter(rect => !occupied.some(other => overlaps(rect, other)));
        const clearOfMarkers = candidate => !visible.some(other => other.id !== point.id && coversMarker(candidate, other));
        const validPreferred = available.includes(preferred) && (point.priority > 0 || clearOfMarkers(preferred));
        const rect = (validPreferred ? preferred : undefined)
            || available.find(clearOfMarkers)
            || (point.priority > 0 ? available[0] : undefined);
        if (!rect) return;
        result.set(point.id, rect);
        occupied.push(rect);
        anchors.push(point);
    };

    visible.filter(point => point.priority > 0)
        .sort((a, b) => b.priority - a.priority || byId(a, b))
        .forEach(point => place(point));
    if (!showLabels) return result;

    if (preferredLayout) {
        const ordinaryById = new Map(visible.filter(point => point.priority <= 0).map(point => [point.id, point]));
        for (const id of preferredLayout.keys()) {
            const point = ordinaryById.get(id);
            if (point) place(point, true);
        }
        return result;
    }

    const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
    const budget = Math.max(1, Math.floor(width * height / 28000 * Math.min(1.8, Math.sqrt(safeZoom))));
    const remaining = visible.filter(point => point.priority <= 0);
    const distance = point => anchors.length
        ? Math.min(...anchors.map(anchor => (point.x - anchor.x) ** 2 + (point.y - anchor.y) ** 2))
        : -((point.x - width / 2) ** 2 + (point.y - height / 2) ** 2);

    // Farthest-first selection keeps sparse labels spread across the visible map.
    while (remaining.length && result.size < budget) {
        remaining.sort((a, b) => distance(b) - distance(a) || byId(a, b));
        place(remaining.shift());
    }
    return result;
}
