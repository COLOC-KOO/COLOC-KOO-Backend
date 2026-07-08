const { query, insertAndGetId } = require('../Services/db.service');

async function list(req, res, next) {
  try {
    const rows = await query(`
      SELECT *
      FROM partenaires
      WHERE COALESCE(actif, 1) = 1
      ORDER BY CASE
        WHEN niveau = 'Diamant' THEN 4
        WHEN niveau = 'Or' THEN 3
        WHEN niveau = 'Argent' THEN 2
        WHEN niveau = 'Bronze' THEN 1
        ELSE 0
      END DESC, nom ASC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createRequest(req, res, next) {
  try {
    const {
      nom,
      nom_entreprise,
      email,
      telephone,
      phone,
      phoneCC,
      secteur,
      niveau_souhaite,
      niveau,
      message,
      activity,
      wantCallback,
      callbackDate,
      callbackSlot,
      wantBrochure,
      souhaite_rappel,
      date_rappel,
      creneau_rappel,
      souhaite_plaquette,
    } = req.body;

    const fullName = (nom || nom_entreprise || '').toString().trim();
    const contactEmail = (email || '').toString().trim();
    const contactPhone = (telephone || phone || '').toString().trim();
    const contactCode = (phoneCC || '').toString().trim();
    const contactSector = (secteur || '').toString().trim();
    const requestedLevel = (niveau_souhaite || niveau || '').toString().trim();
    const requestMessage = (message || activity || '').toString().trim();
    const wantsCallback = Boolean(wantCallback || souhaite_rappel);
    const wantsBrochure = Boolean(wantBrochure || souhaite_plaquette);

    if (!fullName || !contactEmail) {
      return res.status(400).json({ message: 'Nom et email requis.' });
    }

    const id = await insertAndGetId(
      `INSERT INTO demandes_partenaires (
        nom_entreprise,
        nom_contact,
        email,
        telephone,
        telephone_code,
        secteur,
        niveau_souhaite,
        message,
        souhaite_rappel,
        date_rappel,
        creneau_rappel,
        souhaite_plaquette
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        fullName,
        fullName,
        contactEmail,
        contactPhone || null,
        contactCode || null,
        contactSector || null,
        requestedLevel || null,
        requestMessage || null,
        wantsCallback ? 1 : 0,
        callbackDate || date_rappel || null,
        callbackSlot || creneau_rappel || null,
        wantsBrochure ? 1 : 0,
      ]
    );

    res.status(201).json({ id_demande: id, message: 'Demande de partenariat enregistrée.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, createRequest };
