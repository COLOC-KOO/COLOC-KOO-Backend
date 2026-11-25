const CITY_TYPES = new Set(['city', 'town', 'village', 'municipality']);

function mapCityResult(result) {
  const category = result?.class || result?.category;
  if (!result || category !== 'place' || !CITY_TYPES.has(result.type)) return null;

  const address = result.address || {};
  const nomVille = address.city || address.town || address.village || address.municipality;
  const nomRegion = address.state || address.region || address.county || address.state_district;
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const osmType = {
    node: 'N',
    way: 'W',
    relation: 'R',
  }[String(result.osm_type || '').toLowerCase()] || String(result.osm_type || '').toUpperCase();
  const osmId = Number(result.osm_id);
  if (
    !nomVille ||
    !nomRegion ||
    address.country_code?.toLowerCase() !== 'mg' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !['N', 'W', 'R'].includes(osmType) ||
    !Number.isInteger(osmId) ||
    osmId <= 0
  ) return null;

  return {
    osm_type: osmType,
    osm_id: osmId,
    nom_ville: String(nomVille).trim(),
    nom_region: String(nomRegion).trim(),
    latitude,
    longitude,
    display_name: result.display_name || `${nomVille}, ${nomRegion}, Madagascar`,
  };
}

module.exports = { mapCityResult };
