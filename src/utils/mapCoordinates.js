// These constants are the result of d3.geoMercator().fitSize([1200, 620],
// data/source-evidence/istanbul-districts.json), as used by
// scripts/update-district-paths.cjs to generate the current district outlines.
// Keep geographic points in that same projection. Older saved svgCoords use a
// different projection and some were spread apart to avoid label collisions.
const MERCATOR_SCALE = 34167.86399825354;
const TRANSLATE_X = -16672.9019835899;
const TRANSLATE_Y = 27315.596160993922;
const RADIANS = Math.PI / 180;

/** Project the recorded location without displacing it for label placement. */
export function projectNeighborhoodCoordinates(neighborhood) {
  const { latitude, longitude, svgCoords } = neighborhood || {};
  if (Number.isFinite(latitude) && Math.abs(latitude) < 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
    return {
      x: TRANSLATE_X + MERCATOR_SCALE * longitude * RADIANS,
      y: TRANSLATE_Y - MERCATOR_SCALE * Math.log(Math.tan(Math.PI / 4 + latitude * RADIANS / 2)),
    };
  }
  // Older callers may only provide already projected coordinates.
  if (Number.isFinite(svgCoords?.x) && Number.isFinite(svgCoords?.y)) {
    return { x: svgCoords.x, y: svgCoords.y };
  }
  return null;
}
