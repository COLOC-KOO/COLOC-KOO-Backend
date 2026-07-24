const router = require('express').Router();

// Simple in-memory cache to reduce requests to Nominatim
const cache = new Map();

const https = require('https');

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
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ColocKOO-Server/1.0 (contact@example.com)' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            console.warn('Nominatim responded with status', res.statusCode);
            return resolve(null);
          }
          const data = JSON.parse(body);
          if (Array.isArray(data) && data.length > 0) {
            return resolve({
              latitude: parseFloat(data[0].lat),
              longitude: parseFloat(data[0].lon),
              displayName: data[0].display_name,
            });
          }
          return resolve(null);
        } catch (err) {
          console.error('Error parsing nominatim response', err);
          return reject(err);
        }
      });
    });
    req.on('error', (err) => {
      console.error('HTTPS request error', err);
      reject(err);
    });
    req.setTimeout(10000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

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
