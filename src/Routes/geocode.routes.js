const router = require('express').Router();
const { query, withTransaction } = require('../Services/db.service');
const { mapCityResult, mergeCitySuggestions } = require('../Services/osmCities.service');
const { requireAuth } = require('../Middleware/auth.middleware');

// Simple in-memory cache to reduce requests to Nominatim
const cache = new Map();

const https = require('https');
const NOMINATIM_USER_AGENT = 'ColocKOO/1.0';
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function requestNominatim(url) {
  const request = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimRequestAt = Date.now();

    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'fr' },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const error = new Error(`Nominatim responded with status ${res.statusCode}`);
            error.statusCode = res.statusCode;
            return reject(error);
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(new Error('Nominatim request timed out')));
    });
  });
  nominatimQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function searchCities(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().replace(/\s+/g, ' ');
    if (!q) return res.json([]);
    if (q.length > 100) return res.status(400).json({ message: 'Recherche de ville trop longue.' });

    const cacheKey = `cities:${q.toLocaleLowerCase('fr')}`;
    if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

    const prefix = q.replace(/[!%_]/g, '!$&');
    const localCities = await query(
      `SELECT v.id_ville, v.nom_ville, v.id_region, r.nom_region
       FROM villes v
       JOIN regions r ON r.id_region = v.id_region
       WHERE v.nom_ville LIKE ? ESCAPE '!'
       ORDER BY v.nom_ville
       LIMIT 5`,
      [`${prefix}%`]
    ).then((rows) => rows.map((city) => ({
      ...city,
      id_ville: Number(city.id_ville),
      id_region: Number(city.id_region),
    })));

    let osmCities = [];
    if (q.length >= 3) {
      const params = new URLSearchParams({
        q: `${q}, Madagascar`,
        format: 'jsonv2',
        addressdetails: '1',
        countrycodes: 'mg',
        featuretype: 'city',
        limit: '8',
      });
      try {
        const results = await requestNominatim(`https://nominatim.openstreetmap.org/search?${params}`);
        osmCities = (Array.isArray(results) ? results : [])
          .map(mapCityResult)
          .filter(Boolean);
      } catch (error) {
        if (!localCities.length) throw error;
        console.warn('[geocode] Nominatim city search failed; returning local matches.', error.message);
      }
    }

    const suggestions = mergeCitySuggestions(localCities, osmCities, q);
    cache.set(cacheKey, suggestions);
    setTimeout(() => cache.delete(cacheKey), 60 * 60 * 1000);
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
}

async function resolveCity(req, res, next) {
  try {
    const osmType = String(req.body?.osm_type || '').toUpperCase();
    const osmId = Number(req.body?.osm_id);
    if (!['N', 'W', 'R'].includes(osmType) || !Number.isInteger(osmId) || osmId <= 0) {
      return res.status(400).json({ message: 'Ville sélectionnée invalide.' });
    }

    const params = new URLSearchParams({
      osm_ids: `${osmType}${osmId}`,
      format: 'jsonv2',
      addressdetails: '1',
    });
    const results = await requestNominatim(`https://nominatim.openstreetmap.org/lookup?${params}`);
    const city = Array.isArray(results) ? mapCityResult(results[0]) : null;
    if (!city) return res.status(404).json({ message: 'Cette localité n’est plus disponible.' });

    const existing = await query(
      'SELECT v.id_ville, v.nom_ville, v.id_region, r.nom_region FROM villes v JOIN regions r ON r.id_region = v.id_region WHERE LOWER(TRIM(v.nom_ville)) = LOWER(TRIM(?)) LIMIT 1',
      [city.nom_ville]
    );
    if (existing.length) return res.json(existing[0]);

    const createdCity = await withTransaction(async (tx) => {
      const regionResult = await tx(
        'INSERT INTO regions (nom_region) VALUES (?) ON DUPLICATE KEY UPDATE id_region = LAST_INSERT_ID(id_region)',
        [city.nom_region]
      );
      const regionId = Number(regionResult.insertId);
      if (!Number.isInteger(regionId) || regionId <= 0) {
        throw new Error('Impossible de créer la région associée à la ville.');
      }

      const cityResult = await tx(
        'INSERT INTO villes (nom_ville, id_region) VALUES (?, ?) ON DUPLICATE KEY UPDATE id_ville = LAST_INSERT_ID(id_ville)',
        [city.nom_ville, regionId]
      );
      const cityId = Number(cityResult.insertId);
      if (!Number.isInteger(cityId) || cityId <= 0) {
        throw new Error('Impossible de créer la ville sélectionnée.');
      }

      const rows = await tx(
        'SELECT v.id_ville, v.nom_ville, v.id_region, r.nom_region FROM villes v JOIN regions r ON r.id_region = v.id_region WHERE v.id_ville = ? LIMIT 1',
        [cityId]
      );
      if (!rows.length) throw new Error('La ville créée est introuvable.');
      return rows[0];
    });
    res.status(201).json(createdCity);
  } catch (err) {
    next(err);
  }
}

// Helper: fetch from OpenCage (if API key provided)
async function fetchOpenCage(q) {
  const key = process.env.OPEN_CAGE_KEY;
  if (!key) return null;
  const encoded = encodeURIComponent(q + ', Madagascar');
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encoded}&key=${key}&countrycode=mg&limit=1`;
  console.log('OpenCage requesting', url.replace(/key=.+$/, 'key=REDACTED'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ColocKOO-Server/1.0 (contact@example.com)' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) return resolve(null);
          const data = JSON.parse(body);
          if (data && data.results && data.results.length > 0) {
            const r = data.results[0];
            return resolve({ latitude: r.geometry.lat, longitude: r.geometry.lng, displayName: r.formatted });
          }
          return resolve(null);
        } catch (err) {
          console.error('OpenCage parse error', err);
          return reject(err);
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

// Helper: fetch from Nominatim
async function fetchNominatim(q) {
  const encoded = encodeURIComponent(q + ', Madagascar');
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=mg`;
  // If OpenCage key is provided, prefer it
  try {
    const openCageResult = await fetchOpenCage(q);
    if (openCageResult) return openCageResult;
  } catch (err) {
    console.warn('OpenCage request failed, falling back to Nominatim', err?.message || err);
  }

  console.log('Geocode proxy requesting (https) Nominatim', url);
  const data = await requestNominatim(url);
  if (Array.isArray(data) && data.length > 0) {
    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }
  return null;
}

router.get('/cities', searchCities);
router.post('/cities/resolve', requireAuth, resolveCity);

// GET /api/geocode?q=Antsirabe
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

    if (cache.has(q)) {
      return res.json({ ok: true, fromCache: true, result: cache.get(q) });
    }

    const result = await fetchNominatim(q);
    if (result) {
      // cache for 24 hours
      cache.set(q, result);
      setTimeout(() => cache.delete(q), 24 * 60 * 60 * 1000);
      return res.json({ ok: true, fromCache: false, result });
    }

    return res.status(404).json({ ok: false, error: 'Not found' });
  } catch (err) {
    console.error('Geocode error', err);
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

module.exports = router;
