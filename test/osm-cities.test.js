const test = require('node:test');
const assert = require('node:assert/strict');
const { mapCityResult } = require('../src/Services/osmCities.service');

test('maps a Nominatim jsonv2 city result for Madagascar', () => {
  const city = mapCityResult({
    category: 'place',
    type: 'city',
    osm_type: 'node',
    osm_id: 254609408,
    lat: '-23.3541730',
    lon: '43.6696600',
    display_name: 'Toliara, Toliara I, Atsimo-Andrefana, Madagascar',
    address: {
      city: 'Toliara',
      state: 'Atsimo-Andrefana',
      country_code: 'mg',
    },
  });

  assert.deepEqual(city, {
    osm_type: 'N',
    osm_id: 254609408,
    nom_ville: 'Toliara',
    nom_region: 'Atsimo-Andrefana',
    latitude: -23.354173,
    longitude: 43.66966,
    display_name: 'Toliara, Toliara I, Atsimo-Andrefana, Madagascar',
  });
});

test('rejects non-city places and results outside Madagascar', () => {
  const result = {
    category: 'place',
    type: 'neighbourhood',
    osm_type: 'node',
    osm_id: 12,
    lat: '-18.9',
    lon: '47.5',
    address: { city: 'Antananarivo', state: 'Analamanga', country_code: 'mg' },
  };

  assert.equal(mapCityResult(result), null);
  assert.equal(mapCityResult({
    ...result,
    type: 'city',
    address: { ...result.address, country_code: 'fr' },
  }), null);
});
