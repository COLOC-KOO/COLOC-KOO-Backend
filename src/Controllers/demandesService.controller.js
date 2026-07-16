const { query, insertAndGetId } = require('../Services/db.service');

// ============================================================================
//  Demandes de service — autres services Coloc'KOO (cle_service = 'service_%')
//  Page publique « Service » : catalogue visible par tous, soumission d'une
//  demande reservee aux utilisateurs connectes. Enregistre dans demandes_service.
// ============================================================================

// Cree la table si besoin (robustesse dev, avant application de la migration).
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS demandes_service (
      id_demande_service INT(11) NOT NULL AUTO_INCREMENT,
      reference VARCHAR(40) NOT NULL,
      id_utilisateur INT(11) NOT NULL,
      id_service INT(11) NOT NULL,
      quantite INT(11) NOT NULL DEFAULT 1,
      prix_unitaire INT(11) NOT NULL,
      statut ENUM('nouvelle','en-cours','traitee','annulee') NOT NULL DEFAULT 'nouvelle',
      message TEXT NULL,
      telephone VARCHAR(30) NULL,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_demande_service),
      KEY idx_ds_reference (reference),
      KEY fk_ds_utilisateur (id_utilisateur),
      KEY fk_ds_service (id_service)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// Prévient le staff (admin + super_admin actifs) qu'une demande de service arrive.
// Best-effort : on n'échoue pas la demande si la notif ne part pas.
async function notifyStaff(userId, lignes, reference, total) {
  try {
    const [demandeur] = await query(
      'SELECT nom, prenom FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1',
      [userId]
    );
    const nomComplet = demandeur ? `${demandeur.prenom || ''} ${demandeur.nom || ''}`.trim() : `#${userId}`;

    const noms = await query(
      `SELECT nom FROM services_ckoo WHERE id_service IN (${lignes.map(() => '?').join(',')})`,
      lignes.map((l) => l.id_service)
    );
    const listeServices = noms.map((s) => s.nom).join(', ');

    const staff = await query(
      `SELECT u.id_utilisateur
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE r.nom_role IN ('admin', 'super_admin') AND u.statut = 'active'`
    );

    const titre = 'Nouvelle demande de service';
    const texte = `${nomComplet} demande : ${listeServices} (réf. ${reference}, total estimé ${total} Ar).`;
    for (const s of staff) {
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'systeme', ?, ?, ?)`,
        [s.id_utilisateur, titre, texte, '/admin/suivi-missions']
      ).catch(() => {});
    }
  } catch {
    /* notif best-effort */
  }
}

// GET /api/demandes-service/catalogue — public
// Renvoie uniquement les « autres services » actifs (cle_service commence par 'service_').
async function listCatalogue(req, res, next) {
  try {
    const rows = await query(
      `SELECT id_service, cle_service, nom, description, prix, unite
       FROM services_ckoo
       WHERE cle_service LIKE 'service\\_%' AND est_actif = 1
       ORDER BY nom ASC`
    );
    res.json(
      rows.map((r) => ({
        id: r.id_service,
        cle: r.cle_service,
        nom: r.nom,
        description: r.description,
        prix: Number(r.prix) || 0,
        unite: r.unite,
      }))
    );
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service — connecte
// Body : { services: [{ id_service, quantite }], message?, telephone? }
async function createDemande(req, res, next) {
  try {
    await ensureTable();
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifie.' });

    const services = Array.isArray(req.body?.services) ? req.body.services : [];
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : null;
    const telephone = typeof req.body?.telephone === 'string' ? req.body.telephone.trim() : null;

    if (!services.length) {
      return res.status(400).json({ message: 'Sélectionne au moins un service.' });
    }

    // On ne fait confiance qu'aux prix en base + on verrouille au type 'service_%'.
    const ids = [...new Set(services.map((s) => Number(s.id_service)).filter(Boolean))];
    if (!ids.length) {
      return res.status(400).json({ message: 'Services invalides.' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const catalogue = await query(
      `SELECT id_service, prix FROM services_ckoo
       WHERE id_service IN (${placeholders}) AND cle_service LIKE 'service\\_%' AND est_actif = 1`,
      ids
    );
    const priceById = new Map(catalogue.map((r) => [Number(r.id_service), Number(r.prix) || 0]));

    // Multi-selection SANS quantite : une simple demande => quantite = 1 par service.
    const lignes = [];
    for (const id of ids) {
      if (!priceById.has(id)) continue; // ignore ce qui n'est pas un service_* actif
      lignes.push({ id_service: id, prix_unitaire: priceById.get(id) });
    }
    if (!lignes.length) {
      return res.status(400).json({ message: 'Aucun service valide dans la demande.' });
    }

    const reference = `DS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    for (const l of lignes) {
      await insertAndGetId(
        `INSERT INTO demandes_service
           (reference, id_utilisateur, id_service, quantite, prix_unitaire, message, telephone)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
        [reference, userId, l.id_service, l.prix_unitaire, message, telephone]
      );
    }

    const total = lignes.reduce((sum, l) => sum + l.prix_unitaire, 0);

    // Notifie le staff (admin + super_admin actifs) — table `notifications`.
    await notifyStaff(userId, lignes, reference, total);

    res.status(201).json({
      reference,
      total,
      lignes: lignes.length,
      message: 'Demande enregistrée.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/demandes-service/mine — connecte
// Regroupe les demandes de l'utilisateur par reference.
async function listMine(req, res, next) {
  try {
    await ensureTable();
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifie.' });

    const rows = await query(
      `SELECT d.reference, d.statut, d.message, d.telephone, d.date_creation,
              d.quantite, d.prix_unitaire, s.nom AS service_nom, s.unite
       FROM demandes_service d
       JOIN services_ckoo s ON s.id_service = d.id_service
       WHERE d.id_utilisateur = ?
       ORDER BY d.date_creation DESC, d.reference`,
      [userId]
    );

    const byRef = new Map();
    for (const r of rows) {
      if (!byRef.has(r.reference)) {
        byRef.set(r.reference, {
          reference: r.reference,
          statut: r.statut,
          message: r.message,
          telephone: r.telephone,
          date_creation: r.date_creation,
          total: 0,
          lignes: [],
        });
      }
      const grp = byRef.get(r.reference);
      const sousTotal = (Number(r.prix_unitaire) || 0) * (Number(r.quantite) || 1);
      grp.total += sousTotal;
      grp.lignes.push({
        nom: r.service_nom,
        unite: r.unite,
        quantite: Number(r.quantite) || 1,
        prix_unitaire: Number(r.prix_unitaire) || 0,
        sous_total: sousTotal,
      });
    }

    res.json([...byRef.values()]);
  } catch (err) {
    next(err);
  }
}

// GET /api/demandes-service/admin — staff (admin / super_admin)
// Toutes les demandes, regroupees par reference, avec le nom du demandeur.
async function listForStaff(req, res, next) {
  try {
    await ensureTable();
    const rows = await query(
      `SELECT d.reference, d.statut, d.message, d.telephone, d.date_creation,
              d.quantite, d.prix_unitaire, s.nom AS service_nom, s.unite,
              d.id_utilisateur, u.nom AS user_nom, u.prenom AS user_prenom, u.email AS user_email
       FROM demandes_service d
       JOIN services_ckoo s ON s.id_service = d.id_service
       JOIN utilisateurs u ON u.id_utilisateur = d.id_utilisateur
       ORDER BY d.date_creation DESC, d.reference`
    );

    const byRef = new Map();
    for (const r of rows) {
      if (!byRef.has(r.reference)) {
        byRef.set(r.reference, {
          reference: r.reference,
          statut: r.statut,
          message: r.message,
          telephone: r.telephone,
          email: r.user_email || null,
          id_utilisateur: r.id_utilisateur,
          date_creation: r.date_creation,
          demandeur: `${r.user_prenom || ''} ${r.user_nom || ''}`.trim(),
          total: 0,
          services: [],
          lignes: [],
        });
      }
      const grp = byRef.get(r.reference);
      const quantite = Number(r.quantite) || 1;
      const prixUnitaire = Number(r.prix_unitaire) || 0;
      const sousTotal = quantite * prixUnitaire;
      grp.total += sousTotal;
      grp.services.push(r.service_nom);
      grp.lignes.push({
        nom: r.service_nom,
        unite: r.unite,
        quantite,
        prix_unitaire: prixUnitaire,
        sous_total: sousTotal,
      });
    }

    res.json([...byRef.values()]);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/demandes-service/:reference/statut — staff
// Change le statut de TOUTES les lignes d'une demande (partagent la reference).
// Utilisé notamment par le bouton « masquer » de la cloche (=> statut 'en-cours').
async function updateStatut(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const statut = String(req.body?.statut || '');
    const allowed = ['nouvelle', 'en-cours', 'traitee', 'annulee'];
    if (!allowed.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    await query('UPDATE demandes_service SET statut = ? WHERE reference = ?', [statut, reference]);
    res.json({ message: 'Statut mis à jour.', reference, statut });
  } catch (err) {
    next(err);
  }
}

module.exports = { ensureTable, listCatalogue, createDemande, listMine, listForStaff, updateStatut };
