const { query, insertAndGetId } = require('../Services/db.service');
const notify = require('../Services/notify.service');
const mail = require('../Services/mail.service');

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
      -- NOUVELLES COLONNES POUR LE SUIVI
      dernier_contact VARCHAR(100) NULL COMMENT 'Dernier contact (appel/mail)',
      relance VARCHAR(100) NULL COMMENT 'Date de la dernière relance',
      synthese TEXT NULL COMMENT 'Synthèse des échanges',
      rdv_date DATETIME NULL COMMENT 'Date du RDV téléphonique',
      rdv_note VARCHAR(255) NULL COMMENT 'Note du RDV',
      PRIMARY KEY (id_demande_service),
      KEY idx_ds_reference (reference),
      KEY fk_ds_utilisateur (id_utilisateur),
      KEY fk_ds_service (id_service)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// ============================================================================
//  FONCTIONS D'ENVOI D'EMAIL POUR LES DEMANDES DE SERVICE
// ============================================================================

/**
 * Envoie un email au demandeur pour confirmer la réception de sa demande
 */
async function envoyerEmailConfirmation(reference, email, prenom, nom, message, services) {
  try {
    const sujet = `Confirmation de votre demande de service - ${reference}`;
    const contenu = `
      <p>Bonjour <strong>${prenom || ''} ${nom || ''}</strong>,</p>
      <p>Nous avons bien reçu votre demande de service (référence: <strong>${reference}</strong>).</p>
      ${services ? `<p><strong>Services demandés :</strong> ${services}</p>` : ''}
      ${message ? `<p><strong>Votre message :</strong></p><blockquote style="background:#f3f4f6;padding:10px;border-radius:4px;">${message}</blockquote>` : ''}
      <p>Un conseiller Coloc'KOO vous contactera dans les plus brefs délais.</p>
      <p>---</p>
      <p style="font-size:12px;color:#6b7280;">Vous pouvez suivre l'état de votre demande dans votre compte.</p>
    `;

    const html = mail.wrapLayout(sujet, contenu);
    await mail.sendEmail(email, sujet, html, `Confirmation de votre demande ${reference}`);
    return true;
  } catch (error) {
    console.error('[demandesService] Erreur envoi email confirmation:', error);
    return false;
  }
}

/**
 * Envoie un email au demandeur pour le notifier qu'un RDV a été programmé
 */
async function envoyerEmailRdv(reference, email, prenom, nom, rdvDate, rdvNote) {
  try {
    const sujet = `RDV téléphonique programmé - ${reference}`;
    const dateFormatee = new Date(rdvDate).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const contenu = `
      <p>Bonjour <strong>${prenom || ''} ${nom || ''}</strong>,</p>
      <p>Un RDV téléphonique a été programmé concernant votre demande de service (référence: <strong>${reference}</strong>).</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:12px 0;">
        <p style="margin:0;"><strong>📅 Date :</strong> ${dateFormatee}</p>
        ${rdvNote ? `<p style="margin:4px 0 0;"><strong>📝 Note :</strong> ${rdvNote}</p>` : ''}
      </div>
      <p>L'équipe Coloc'KOO vous contactera à l'heure prévue.</p>
    `;

    const html = mail.wrapLayout(sujet, contenu);
    await mail.sendEmail(email, sujet, html, `RDV programmé pour ${reference}`);
    return true;
  } catch (error) {
    console.error('[demandesService] Erreur envoi email RDV:', error);
    return false;
  }
}

/**
 * Envoie un email de relance au demandeur
 */
async function envoyerEmailRelance(reference, email, prenom, nom) {
  try {
    const sujet = `Relance - Votre demande de service ${reference}`;
    const contenu = `
      <p>Bonjour <strong>${prenom || ''} ${nom || ''}</strong>,</p>
      <p>Nous vous relançons concernant votre demande de service (référence: <strong>${reference}</strong>).</p>
      <p>Avez-vous des questions supplémentaires ? N'hésitez pas à nous contacter.</p>
      <p>Nous restons à votre disposition.</p>
      <p>---</p>
      <p style="font-size:12px;color:#6b7280;">L'équipe Coloc'KOO</p>
    `;

    const html = mail.wrapLayout(sujet, contenu);
    await mail.sendEmail(email, sujet, html, `Relance - Demande ${reference}`);
    return true;
  } catch (error) {
    console.error('[demandesService] Erreur envoi email relance:', error);
    return false;
  }
}

/**
 * Envoie un email de validation de la demande
 */
async function envoyerEmailValidation(reference, email, prenom, nom) {
  try {
    const sujet = `✅ Votre demande de service ${reference} a été validée`;
    const contenu = `
      <p>Bonjour <strong>${prenom || ''} ${nom || ''}</strong>,</p>
      <p>Bonne nouvelle ! Votre demande de service (référence: <strong>${reference}</strong>) a été <strong>validée</strong>.</p>
      <p>Le processus est maintenant en cours. Vous serez tenu informé des prochaines étapes.</p>
      <p>---</p>
      <p style="font-size:12px;color:#6b7280;">L'équipe Coloc'KOO</p>
    `;

    const html = mail.wrapLayout(sujet, contenu);
    await mail.sendEmail(email, sujet, html, `Demande ${reference} validée`);
    return true;
  } catch (error) {
    console.error('[demandesService] Erreur envoi email validation:', error);
    return false;
  }
}

/**
 * Envoie un email d'annulation de la demande
 */
async function envoyerEmailAnnulation(reference, email, prenom, nom) {
  try {
    const sujet = `❌ Votre demande de service ${reference} a été annulée`;
    const contenu = `
      <p>Bonjour <strong>${prenom || ''} ${nom || ''}</strong>,</p>
      <p>Votre demande de service (référence: <strong>${reference}</strong>) a été <strong>annulée</strong>.</p>
      <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
      <p>---</p>
      <p style="font-size:12px;color:#6b7280;">L'équipe Coloc'KOO</p>
    `;

    const html = mail.wrapLayout(sujet, contenu);
    await mail.sendEmail(email, sujet, html, `Demande ${reference} annulée`);
    return true;
  } catch (error) {
    console.error('[demandesService] Erreur envoi email annulation:', error);
    return false;
  }
}

/**
 * Récupère les informations du demandeur et les services associés à une référence
 */
async function getDemandeInfo(reference) {
  const [demande] = await query(
    `SELECT 
       d.id_utilisateur, 
       d.reference, 
       d.message, 
       d.telephone,
       u.email, 
       u.nom, 
       u.prenom,
       GROUP_CONCAT(s.nom SEPARATOR ', ') as services
     FROM demandes_service d
     JOIN utilisateurs u ON u.id_utilisateur = d.id_utilisateur
     JOIN services_ckoo s ON s.id_service = d.id_service
     WHERE d.reference = ?
     GROUP BY d.id_demande_service`,
    [reference]
  );
  return demande;
}

// ============================================================================
// 1. ROUTES EXISTANTES (inchangées)
// ============================================================================

// GET /api/demandes-service/catalogue — public
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

    const lignes = [];
    for (const id of ids) {
      if (!priceById.has(id)) continue;
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

    // ✅ Envoyer un email de confirmation au demandeur
    const [user] = await query(
      'SELECT email, nom, prenom FROM utilisateurs WHERE id_utilisateur = ?',
      [userId]
    );
    if (user && user.email) {
      const serviceNames = lignes.map((l) => l.nom || 'Service').join(', ');
      await envoyerEmailConfirmation(reference, user.email, user.prenom, user.nom, message, serviceNames);
    }

    // ✅ Notifier le staff (admin + super_admin)
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
async function listMine(req, res, next) {
  try {
    await ensureTable();
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifie.' });

    const rows = await query(
      `SELECT d.reference, d.statut, d.message, d.telephone, d.date_creation,
              d.quantite, d.prix_unitaire, s.nom AS service_nom, s.unite,
              d.dernier_contact, d.relance, d.synthese, d.rdv_date, d.rdv_note
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
          dernier_contact: r.dernier_contact || null,
          relance: r.relance || null,
          synthese: r.synthese || null,
          rdv: r.rdv_date ? {
            date: r.rdv_date,
            note: r.rdv_note
          } : null
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
async function listForStaff(req, res, next) {
  try {
    await ensureTable();
    const rows = await query(
      `SELECT d.reference, d.statut, d.message, d.telephone, d.date_creation,
              d.quantite, d.prix_unitaire, s.nom AS service_nom, s.unite,
              d.id_utilisateur, u.nom AS user_nom, u.prenom AS user_prenom, u.email AS user_email,
              d.dernier_contact, d.relance, d.synthese, d.rdv_date, d.rdv_note
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
          dernier_contact: r.dernier_contact || null,
          relance: r.relance || null,
          synthese: r.synthese || null,
          rdv_date: r.rdv_date || null,
          rdv_note: r.rdv_note || null
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

// ============================================================================
// 2. NOUVELLES FONCTIONS AVEC ENVOI D'EMAILS RÉELS
// ============================================================================

// POST /api/demandes-service/:reference/appel
async function marquerAppele(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    // ✅ Mise à jour de la base de données
    await query(
      `UPDATE demandes_service 
       SET dernier_contact = ?, statut = 'en-cours' 
       WHERE reference = ?`,
      [`Appel le ${now}`, reference]
    );

    // ✅ Envoyer une notification in-app au demandeur (optionnel)
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `📞 Appel effectué - ${reference}`,
        texte: `Un conseiller vous a contacté concernant votre demande ${reference}.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'Appel marqué',
      email_envoye: false
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/mail — ENVOIE UN VRAI EMAIL
async function marquerMailEnvoye(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    // ✅ Mise à jour de la base de données
    await query(
      `UPDATE demandes_service 
       SET dernier_contact = ?, statut = 'en-cours' 
       WHERE reference = ?`,
      [`Mail le ${now}`, reference]
    );

    // ✅ ENVOYER UN VRAI EMAIL
    let emailEnvoye = false;
    if (demande && demande.email) {
      emailEnvoye = await envoyerEmailConfirmation(
        reference,
        demande.email,
        demande.prenom,
        demande.nom,
        demande.message,
        demande.services
      );
    }

    // ✅ Envoyer une notification in-app au demandeur
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `📧 Email envoyé - ${reference}`,
        texte: `Un email de confirmation a été envoyé concernant votre demande ${reference}.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'Mail envoyé marqué',
      email_envoye: emailEnvoye
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/relance — ENVOIE UN EMAIL DE RELANCE
async function relancerDemande(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    // ✅ Mise à jour de la base de données
    await query(
      `UPDATE demandes_service 
       SET relance = ? 
       WHERE reference = ?`,
      [`Relance le ${now}`, reference]
    );

    // ✅ ENVOYER UN EMAIL DE RELANCE
    let emailEnvoye = false;
    if (demande && demande.email) {
      emailEnvoye = await envoyerEmailRelance(
        reference,
        demande.email,
        demande.prenom,
        demande.nom
      );
    }

    // ✅ Envoyer une notification in-app au demandeur
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `🔄 Relance envoyée - ${reference}`,
        texte: `Un email de relance a été envoyé concernant votre demande ${reference}.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'Relance effectuée',
      email_envoye: emailEnvoye
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/rdv — ENVOIE UN EMAIL DE CONFIRMATION RDV
async function programmerRdv(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const { date, note } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'La date du RDV est requise' });
    }

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    // ✅ Mise à jour de la base de données
    await query(
      `UPDATE demandes_service 
       SET rdv_date = ?, rdv_note = ?, statut = 'en-cours' 
       WHERE reference = ?`,
      [date, note || '', reference]
    );

    // ✅ ENVOYER UN EMAIL DE CONFIRMATION DU RDV
    let emailEnvoye = false;
    if (demande && demande.email) {
      emailEnvoye = await envoyerEmailRdv(
        reference,
        demande.email,
        demande.prenom,
        demande.nom,
        date,
        note
      );
    }

    // ✅ Envoyer une notification in-app au demandeur
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `📅 RDV programmé - ${reference}`,
        texte: `Un RDV téléphonique a été programmé pour votre demande ${reference}.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'RDV programmé',
      email_envoye: emailEnvoye
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/annuler-rdv
async function annulerRdv(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    await query(
      `UPDATE demandes_service 
       SET rdv_date = NULL, rdv_note = NULL 
       WHERE reference = ?`,
      [reference]
    );

    // ✅ Envoyer une notification in-app
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `❌ RDV annulé - ${reference}`,
        texte: `Le RDV téléphonique pour votre demande ${reference} a été annulé.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({ success: true, message: 'RDV annulé' });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/synthese
async function updateSynthese(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;
    const { synthese } = req.body;

    await query(
      `UPDATE demandes_service 
       SET synthese = ? 
       WHERE reference = ?`,
      [synthese || '', reference]
    );
    res.json({ success: true, message: 'Synthèse mise à jour' });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/valider — ENVOIE UN EMAIL DE VALIDATION
async function validerDemande(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    await query(
      `UPDATE demandes_service 
       SET statut = 'traitee' 
       WHERE reference = ?`,
      [reference]
    );

    // ✅ ENVOYER UN EMAIL DE VALIDATION
    let emailEnvoye = false;
    if (demande && demande.email) {
      emailEnvoye = await envoyerEmailValidation(
        reference,
        demande.email,
        demande.prenom,
        demande.nom
      );
    }

    // ✅ Envoyer une notification in-app au demandeur
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `✅ Demande validée - ${reference}`,
        texte: `Votre demande de service ${reference} a été validée.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'Demande validée',
      email_envoye: emailEnvoye
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/demandes-service/:reference/annuler — ENVOIE UN EMAIL D'ANNULATION
async function annulerDemande(req, res, next) {
  try {
    await ensureTable();
    const { reference } = req.params;

    // ✅ Récupérer les informations du demandeur
    const demande = await getDemandeInfo(reference);

    await query(
      `UPDATE demandes_service 
       SET statut = 'annulee' 
       WHERE reference = ?`,
      [reference]
    );

    // ✅ ENVOYER UN EMAIL D'ANNULATION
    let emailEnvoye = false;
    if (demande && demande.email) {
      emailEnvoye = await envoyerEmailAnnulation(
        reference,
        demande.email,
        demande.prenom,
        demande.nom
      );
    }

    // ✅ Envoyer une notification in-app au demandeur
    if (demande && demande.id_utilisateur) {
      await notify.notifyUser(demande.id_utilisateur, {
        titre: `❌ Demande annulée - ${reference}`,
        texte: `Votre demande de service ${reference} a été annulée.`,
        lien: '/services',
        type: 'systeme'
      });
    }

    res.json({
      success: true,
      message: 'Demande annulée',
      email_envoye: emailEnvoye
    });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// 3. EXPORT
// ============================================================================

module.exports = {
  ensureTable,
  listCatalogue,
  createDemande,
  listMine,
  listForStaff,
  updateStatut,
  marquerAppele,
  marquerMailEnvoye,
  relancerDemande,
  programmerRdv,
  annulerRdv,
  updateSynthese,
  validerDemande,
  annulerDemande
};