/**
 * Physical place association rules shared by district, neighborhood and report views.
 * Never infer a neighborhood from a district alone. A square reaches a neighborhood
 * only through an explicitly linked service point carrying that neighborhood id.
 */
export function getPhysicalPlaceAssociations({ mode, districtId = '', neighborhoodId = '', servicePoints = [], squares = [] }) {
  const points = servicePoints.filter((point) => point.active && point.ilceId === districtId && (mode !== 'neighborhood' || point.mahalleId === neighborhoodId));
  const linkedSquareIds = new Set(points.map((point) => point.meydanId).filter(Boolean));
  const places = squares
    .filter((square) => square.districtId === districtId && (mode !== 'neighborhood' || linkedSquareIds.has(square.id)))
    .map((square) => ({ ...square, placeType: 'MEYDAN', hrefId: square.id }));
  points.forEach((point) => places.push({ ...point, placeType: point.tip === 'SUBE' ? 'SUBE' : 'COZUM_NOKTASI', hrefId: point.id }));
  return { points, squares: places.filter((place) => place.placeType === 'MEYDAN'), places };
}
