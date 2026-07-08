const bcrypt = require('bcryptjs');
const { query, insertAndGetId } = require('../Services/db.service');
const { mapAnnonceRow, mapUserRow } = require('../Services/mappers');

const WARNING_REASONS = [
  'Renseignements manquants',
  'Prix a justifier',
  'Photos non representatives',
  'Offre non conforme (pas une coloc)',
  'Suspicion d arnaque',
  'Contenu inapproprie',
  'Comportement/ harcelement',
  'Notification de Suspension',
];

function actorId(req) {
  return req.user?.id || req.user?.id_utilisateur || null;
}

async function ensureBackofficeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS journal_actions (
      id_action INT NOT NULL AUTO_INCREMENT,
      id_utilisateur INT NULL,
      action VARCHAR(80) NOT NULL,
      cible_type VARCHAR(80) NULL,
      cible_id INT NULL,
      details JSON NULL,
      date_action DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_action),
      KEY idx_journal_action_date (date_action),
      KEY idx_journal_action_type (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS objectifs_equipe (
      id_objectif INT NOT NULL AUTO_INCREMENT,
      libelle VARCHAR(255) NOT NULL,
      objectif INT NOT NULL DEFAULT 0,
      realise INT NOT NULL DEFAULT 0,
      periode ENUM('jour','semaine','mois','trimestre','annee') NOT NULL DEFAULT 'mois',
      statut ENUM('actif','termine','archive') NOT NULL DEFAULT 'actif',
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_objectif)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS configuration_backoffice (
      cle VARCHAR(120) NOT NULL,
      valeur JSON NULL,
      date_modification DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (cle)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query("ALTER TABLE contrats MODIFY COLUMN statut ENUM('a-emettre','a-planifier','brouillon','emis','envoye','signe','annule') NOT NULL DEFAULT 'a-emettre'").catch(() => {});
  await query("ALTER TABLE candidatures MODIFY COLUMN statut ENUM('envoyee','recu','dossier','signature','convention','en_attente','acceptee','refusee','constituee') NOT NULL DEFAULT 'envoyee'").catch(() => {});
}

async function logAction(req, action, cibleType, cibleId, details = null) {
  await ensureBackofficeSchema();
  await query(
    `INSERT INTO journal_actions (id_utilisateur, action, cible_type, cible_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [actorId(req), action, cibleType, cibleId || null, details ? JSON.stringify(details) : null]
  );
}

async function dashboard(req, res, next) {
  try {
    const [queue, validated, members, month, rate, reports, candidates, contracts, payments] = await Promise.all([
      query("SELECT COUNT(*) AS n FROM annonces WHERE statut = 'pending'"),
      query("SELECT COUNT(*) AS n FROM annonces WHERE statut = 'active' AND DATE(date_publication) = CURDATE()"),
      query("SELECT COUNT(*) AS n FROM utilisateurs WHERE statut = 'active'"),
      query("SELECT COUNT(*) AS n FROM annonces WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())"),
      query("SELECT ROUND(100 * SUM(CASE WHEN statut = 'active' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS n FROM annonces"),
      query("SELECT COUNT(*) AS n FROM signalements WHERE statut IN ('new','in_progress')"),
      query("SELECT COUNT(*) AS n FROM candidatures WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())"),
      query("SELECT COUNT(*) AS n FROM contrats WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())"),
      query("SELECT COALESCE(SUM(montant_recu), 0) AS n FROM paiements WHERE MONTH(date_paiement) = MONTH(CURDATE()) AND YEAR(date_paiement) = YEAR(CURDATE()) AND statut IN ('conforme','valide')"),
    ]);

    res.json({
      annoncesFile: Number(queue[0]?.n || 0),
      validationsAujourdhui: Number(validated[0]?.n || 0),
      signalements: Number(reports[0]?.n || 0),
      membresActifs: Number(members[0]?.n || 0),
      annoncesMois: Number(month[0]?.n || 0),
      tauxValidation: Number(rate[0]?.n || 0),
      candidaturesMois: Number(candidates[0]?.n || 0),
      contratsMois: Number(contracts[0]?.n || 0),
      chiffreAffairesMois: Number(payments[0]?.n || 0),
      objectifJour: 30,
      progressObjectif: Math.min(100, Math.round((Number(validated[0]?.n || 0) / 30) * 100)),
    });
  } catch (err) {
    next(err);
  }
}

async function queue(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
             v.nom_ville, r.nom_region, ch.prix_loyer,
             GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
             GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
             GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
      FROM annonces a
      JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
      JOIN villes v ON v.id_ville = a.id_ville
      JOIN regions r ON r.id_region = v.id_region
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
      WHERE a.statut = 'pending'
      GROUP BY a.id_annonce
      ORDER BY a.date_creation DESC
      LIMIT 200
      `
    );
    res.json(rows.map(mapAnnonceRow));
  } catch (err) {
    next(err);
  }
}

const PUBLIC_TO_INTERNAL_ROLE = {
  moderateur: 'moderator',
  admin: 'admin',
  super_admin: 'super_admin',
  proprietaire: 'proprio',
  colocataire: 'coloc',
};

function normalizeMemberStatut(statut) {
  if (!statut) return 'active';
  if (statut === 'actif') return 'active';
  if (statut === 'suspendu') return 'suspended';
  if (statut === 'inactif') return 'inactive';
  return statut;
}

async function resolveRoleId(role) {
  const internalRole = PUBLIC_TO_INTERNAL_ROLE[role] || role || 'coloc';
  const rows = await query('SELECT id_role FROM roles WHERE nom_role = ? LIMIT 1', [internalRole]);
  return rows[0]?.id_role || 1;
}

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(' ').filter(Boolean);
  if (parts.length === 0) return { prenom: '', nom: '' };
  if (parts.length === 1) return { prenom: parts[0], nom: '' };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

async function members(req, res, next) {
  try {
    const { role, q, statut } = req.query;
    const roleMap = {
      locataires: 'coloc',
      colocataires: 'coloc',
      proprietaires: 'proprio',
      agences: 'agent',
      admins: ['admin', 'super_admin', 'moderator'],
    };
    const clauses = [];
    const values = [];
    if (role && role !== 'all' && role !== 'tous') {
      const mapped = roleMap[String(role).toLowerCase()] || role;
      if (Array.isArray(mapped)) {
        clauses.push(`r.nom_role IN (${mapped.map(() => '?').join(',')})`);
        values.push(...mapped);
      } else {
        clauses.push('r.nom_role = ?');
        values.push(mapped);
      }
    }
    if (statut && statut !== 'all') {
      clauses.push('u.statut = ?');
      values.push(statut);
    }
    if (q) {
      clauses.push('(u.nom LIKE ? OR u.prenom LIKE ? OR u.email LIKE ? OR u.telephone LIKE ?)');
      values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const rows = await query(
      `SELECT u.*, r.nom_role,
              COUNT(DISTINCT a.id_annonce) AS annonces_count,
              COUNT(DISTINCT c.id_candidature) AS candidatures_count
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       LEFT JOIN annonces a ON a.id_utilisateur = u.id_utilisateur
       LEFT JOIN candidatures c ON c.id_utilisateur = u.id_utilisateur
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       GROUP BY u.id_utilisateur
       ORDER BY u.date_inscription DESC
       LIMIT 500`,
      values
    );
    res.json(rows.map(row => ({
      ...mapUserRow(row),
      annoncesCount: Number(row.annonces_count || 0),
      candidaturesCount: Number(row.candidatures_count || 0),
    })));
  } catch (err) {
    next(err);
  }
}

async function createMember(req, res, next) {
  try {
    const { nom, email, telephone, mot_de_passe, role, statut } = req.body;
    if (!nom || !email) {
      return res.status(400).json({ message: 'Nom et email sont requis.' });
    }

    const existing = await query('SELECT id_utilisateur FROM utilisateurs WHERE email = ? LIMIT 1', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email déjà utilisé.' });
    }

    const roleId = await resolveRoleId(role);
    const { prenom, nom: nomValue } = splitFullName(nom);
    const password = mot_de_passe && String(mot_de_passe).trim().length > 0 ? mot_de_passe : '123456';
    const hash = await bcrypt.hash(password, 10);
    const userId = await insertAndGetId(
      'INSERT INTO utilisateurs (email, telephone, mot_de_passe, nom, prenom, statut, id_role) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [email, telephone || null, hash, nomValue || nom, prenom, normalizeMemberStatut(statut), roleId]
    );

    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur = ?
       LIMIT 1`,
      [userId]
    );
    const user = rows[0] ? mapUserRow(rows[0]) : null;
    res.status(201).json(user ? { ...user, mot_de_passe: password } : null);
  } catch (err) {
    next(err);
  }
}

async function updateMember(req, res, next) {
  try {
    const allowed = ['nom', 'email', 'telephone', 'statut', 'role'];
    const sets = [];
    const values = [];
    const body = req.body;

    if (body.nom) {
      const { prenom, nom: nomValue } = splitFullName(body.nom);
      sets.push('nom = ?', 'prenom = ?');
      values.push(nomValue || body.nom, prenom);
    }
    if (body.email !== undefined) {
      sets.push('email = ?');
      values.push(body.email);
    }
    if (body.telephone !== undefined) {
      sets.push('telephone = ?');
      values.push(body.telephone || null);
    }
    if (body.statut !== undefined) {
      sets.push('statut = ?');
      values.push(normalizeMemberStatut(body.statut));
    }
    if (body.role !== undefined) {
      const roleId = await resolveRoleId(body.role);
      sets.push('id_role = ?');
      values.push(roleId);
    }
    if (body.mot_de_passe !== undefined && body.mot_de_passe !== '') {
      const passHash = await bcrypt.hash(body.mot_de_passe, 10);
      sets.push('mot_de_passe = ?');
      values.push(passHash);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }

    values.push(req.params.id);
    await query(`UPDATE utilisateurs SET ${sets.join(', ')} WHERE id_utilisateur = ?`, values);

    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur = ?
       LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Membre introuvable.' });
    }
    res.json(mapUserRow(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteMember(req, res, next) {
  try {
    await query('DELETE FROM utilisateurs WHERE id_utilisateur = ?', [req.params.id]);
    await logAction(req, 'Suppression', 'utilisateur', req.params.id, null);
    res.json({ message: 'Membre supprimé.' });
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT DATE_FORMAT(date_creation, '%Y-%m') AS month,
             COUNT(*) AS annonces
      FROM annonces
      GROUP BY DATE_FORMAT(date_creation, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function moderateAnnonce(req, res, next) {
  try {
    const { statut } = req.body;
    const allowedStatuses = ['pending', 'active', 'rejected', 'archived', 'expired', 'en_attente', 'refusee', 'terminee'];
    if (!allowedStatuses.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    const publicationSql = statut === 'active' ? ', date_publication = COALESCE(date_publication, NOW())' : '';
    await query(
      `UPDATE annonces SET statut = ?, date_modification = NOW()${publicationSql} WHERE id_annonce = ?`,
      [statut, req.params.id]
    );
    await logAction(req, statut === 'active' ? 'Validation' : statut === 'rejected' ? 'Rejet' : 'Correction', 'annonce', req.params.id, { statut });
    res.json({ message: 'Annonce mise a jour.' });
  } catch (err) {
    next(err);
  }
}

async function moderateMember(req, res, next) {
  try {
    const { statut, raison, date_suspension_fin } = req.body;
    await query('UPDATE utilisateurs SET statut = ?, date_suspension_fin = ? WHERE id_utilisateur = ?', [statut, date_suspension_fin || null, req.params.id]);
    await logAction(req, statut === 'suspended' ? 'Suspension' : 'Correction', 'utilisateur', req.params.id, { statut, raison });
    res.json({ message: 'Membre mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function signalements(req, res, next) {
  try {
    const rows = await query(
      `SELECT s.*,
              COALESCE(s.statut, 'new') AS statut,
              us.nom AS signaleur_nom, us.prenom AS signaleur_prenom, us.email AS signaleur_email,
              uc.nom AS cible_nom, uc.prenom AS cible_prenom, uc.email AS cible_email,
              a.titre AS annonce_titre, m.contenu AS message_contenu
       FROM signalements s
       LEFT JOIN utilisateurs us ON us.id_utilisateur = s.id_utilisateur_signalant
       LEFT JOIN utilisateurs uc ON uc.id_utilisateur = s.id_utilisateur_cible
       LEFT JOIN annonces a ON a.id_annonce = s.id_annonce
       LEFT JOIN messages m ON m.id_message = s.id_message
       ORDER BY s.date_signalement DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function signalementConversation(req, res, next) {
  try {
    const reportRows = await query(
      `SELECT s.*, us.nom AS signaleur_nom, us.prenom AS signaleur_prenom,
              uc.nom AS cible_nom, uc.prenom AS cible_prenom
       FROM signalements s
       LEFT JOIN utilisateurs us ON us.id_utilisateur = s.id_utilisateur_signalant
       LEFT JOIN utilisateurs uc ON uc.id_utilisateur = s.id_utilisateur_cible
       WHERE s.id_signalement = ? LIMIT 1`,
      [req.params.id]
    );
    if (reportRows.length === 0) return res.status(404).json({ message: 'Signalement introuvable.' });
    const report = reportRows[0];
    let a = report.id_utilisateur_signalant;
    let b = report.id_utilisateur_cible;
    if ((!a || !b) && report.id_message) {
      const msg = await query('SELECT id_expediteur, id_destinataire FROM messages WHERE id_message = ? LIMIT 1', [report.id_message]);
      a = a || msg[0]?.id_expediteur;
      b = b || msg[0]?.id_destinataire;
    }
    const messages = a && b ? await query(
      `SELECT m.*, ex.nom AS expediteur_nom, ex.prenom AS expediteur_prenom,
              de.nom AS destinataire_nom, de.prenom AS destinataire_prenom,
              an.titre AS annonce_titre
       FROM messages m
       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces an ON an.id_annonce = m.id_annonce
       WHERE ((m.id_expediteur = ? AND m.id_destinataire = ?) OR (m.id_expediteur = ? AND m.id_destinataire = ?))
         AND (? IS NULL OR m.id_annonce = ? OR m.id_annonce IS NULL)
       ORDER BY m.date_envoi ASC`,
      [a, b, b, a, report.id_annonce, report.id_annonce]
    ) : [];
    res.json({
      signalement: {
        ...report,
        signaleur_nom: report.signaleur_nom,
        signaleur_prenom: report.signaleur_prenom,
        cible_nom: report.cible_nom,
        cible_prenom: report.cible_prenom,
      },
      membreA: a,
      membreB: b,
      messages,
    });
  } catch (err) {
    next(err);
  }
}

async function updateSignalement(req, res, next) {
  try {
    const { statut = 'resolved', action, raison } = req.body;
    const normalizedStatus = ['new', 'in_progress', 'resolved', 'dismissed'].includes(statut)
      ? statut
      : action === 'dismiss'
        ? 'dismissed'
        : action === 'warn'
          ? 'in_progress'
          : action === 'resolve'
            ? 'resolved'
            : 'resolved';
    await query(
      'UPDATE signalements SET statut = ?, date_resolution = IF(? IN ("resolved","dismissed"), NOW(), date_resolution) WHERE id_signalement = ?',
      [normalizedStatus, normalizedStatus, req.params.id]
    );
    await logAction(req, action === 'dismiss' ? 'Classement sans suite' : action === 'warn' ? 'Avertissement' : action === 'resolve' ? 'Resolution' : 'Correction', 'signalement', req.params.id, { statut: normalizedStatus, raison });
    res.json({ message: 'Signalement mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function warningReasons(req, res) {
  res.json(WARNING_REASONS);
}

async function sendWarning(req, res, next) {
  try {
    const { id_utilisateur, raison, contenu } = req.body;
    if (!id_utilisateur) return res.status(400).json({ message: 'Utilisateur requis.' });
    const subject = raison || 'Avertissement ColocKOO';
    const text = contenu || `Avertissement: ${subject}`;
    const id = await insertAndGetId(
      `INSERT INTO messages (id_expediteur, id_destinataire, sujet, contenu, est_lu)
       VALUES (?, ?, ?, ?, 0)`,
      [actorId(req), id_utilisateur, subject, text]
    );
    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'message', ?, ?, ?)`,
      [id_utilisateur, subject, text, `/admin/messages?message=${id}`]
    ).catch(() => {});
    await logAction(req, 'Message', 'utilisateur', id_utilisateur, { raison: subject, id_message: id });
    res.status(201).json({ id_message: id, redirect: '/admin/messages' });
  } catch (err) {
    next(err);
  }
}

async function conversations(req, res, next) {
  try {
    const rows = await query(
      `SELECT LEAST(id_expediteur, id_destinataire) AS membre_a,
              GREATEST(id_expediteur, id_destinataire) AS membre_b,
              MAX(date_envoi) AS dernier_message,
              COUNT(*) AS total_messages,
              SUM(CASE WHEN est_lu = 0 THEN 1 ELSE 0 END) AS non_lus
       FROM messages
       GROUP BY membre_a, membre_b
       ORDER BY dernier_message DESC
       LIMIT 300`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function conversationMessages(req, res, next) {
  try {
    const rows = await query(
      `SELECT m.*, ex.nom AS expediteur_nom, ex.prenom AS expediteur_prenom,
              de.nom AS destinataire_nom, de.prenom AS destinataire_prenom,
              a.titre AS annonce_titre
       FROM messages m
       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces a ON a.id_annonce = m.id_annonce
       WHERE (m.id_expediteur = ? AND m.id_destinataire = ?) OR (m.id_expediteur = ? AND m.id_destinataire = ?)
       ORDER BY m.date_envoi ASC`,
      [req.params.a, req.params.b, req.params.b, req.params.a]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function contactMessages(req, res, next) {
  try {
    const rows = await query('SELECT * FROM messages_contact ORDER BY date_creation DESC LIMIT 500');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function deleteContactMessage(req, res, next) {
  try {
    await query('DELETE FROM messages_contact WHERE id_message = ?', [req.params.id]);
    res.json({ message: 'Message de contact supprime.' });
  } catch (err) {
    next(err);
  }
}

async function replyContactMessage(req, res, next) {
  try {
    const { contenu, statut = 'read' } = req.body;
    await query('UPDATE messages_contact SET statut = ? WHERE id_message = ?', [statut, req.params.id]);
    await logAction(req, 'Message', 'message_contact', req.params.id, { contenu });
    res.json({ message: 'Reponse enregistree.', redirect: '/admin/messages' });
  } catch (err) {
    next(err);
  }
}

async function journal(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const rows = await query(
      `SELECT ja.*, u.nom, u.prenom, u.email
       FROM journal_actions ja
       LEFT JOIN utilisateurs u ON u.id_utilisateur = ja.id_utilisateur
       ORDER BY ja.date_action DESC
       LIMIT 1000`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function suiviMissions(req, res, next) {
  try {
    const [services, contratsCount, rdv, ca, demandes] = await Promise.all([
      query("SELECT COUNT(*) AS n FROM demandes_ckoo WHERE statut IN ('a-contacter','en-cours')"),
      query("SELECT COUNT(*) AS n FROM contrats WHERE MONTH(date_creation)=MONTH(CURDATE()) AND YEAR(date_creation)=YEAR(CURDATE())"),
      query("SELECT COUNT(*) AS n FROM demandes_ckoo WHERE date_rendez_vous >= NOW()"),
      query("SELECT COALESCE(SUM(montant_recu),0) AS n FROM paiements WHERE statut IN ('conforme','valide') AND MONTH(date_paiement)=MONTH(CURDATE()) AND YEAR(date_paiement)=YEAR(CURDATE())"),
      query(`SELECT d.*, a.titre, u.nom, u.prenom
             FROM demandes_ckoo d
             JOIN annonces a ON a.id_annonce = d.id_annonce
             JOIN utilisateurs u ON u.id_utilisateur = d.id_utilisateur
             ORDER BY d.date_creation DESC LIMIT 200`),
    ]);
    res.json({
      servicesEnCours: Number(services[0]?.n || 0),
      contratsEmisMois: Number(contratsCount[0]?.n || 0),
      rendezVousAvenir: Number(rdv[0]?.n || 0),
      chiffreAffairesMois: Number(ca[0]?.n || 0),
      demandes,
    });
  } catch (err) {
    next(err);
  }
}

async function servicesCkoo(req, res, next) {
  try {
    const rows = await query('SELECT * FROM services_ckoo ORDER BY est_actif DESC, nom ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createServiceCkoo(req, res, next) {
  try {
    const { cle_service, nom, description, prix, unite = 'heure', est_actif = 1 } = req.body;
    if (!nom) return res.status(400).json({ message: 'Nom requis.' });
    const id = await insertAndGetId(
      'INSERT INTO services_ckoo (cle_service, nom, description, prix, unite, est_actif) VALUES (?, ?, ?, ?, ?, ?)',
      [cle_service || `service_${Date.now()}`, nom, description || null, prix || 0, unite, est_actif ? 1 : 0]
    );
    await logAction(req, 'Correction', 'service_ckoo', id, { operation: 'creation' });
    res.status(201).json({ id_service: id });
  } catch (err) {
    next(err);
  }
}

async function updateServiceCkoo(req, res, next) {
  try {
    const allowed = ['cle_service', 'nom', 'description', 'prix', 'unite', 'est_actif'];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ message: 'Aucune modification fournie.' });
    values.push(req.params.id);
    await query(`UPDATE services_ckoo SET ${sets.join(', ')} WHERE id_service = ?`, values);
    await logAction(req, 'Correction', 'service_ckoo', req.params.id, req.body);
    res.json({ message: 'Service mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function deleteServiceCkoo(req, res, next) {
  try {
    await query('UPDATE services_ckoo SET est_actif = 0 WHERE id_service = ?', [req.params.id]);
    await logAction(req, 'Correction', 'service_ckoo', req.params.id, { operation: 'desactivation' });
    res.json({ message: 'Service desactive.' });
  } catch (err) {
    next(err);
  }
}

async function partenaireRequests(req, res, next) {
  try {
    const rows = await query(`
      SELECT id_demande, nom_entreprise, nom_contact, email, telephone, telephone_code, secteur, niveau_souhaite, message,
             statut, date_creation, souhaite_rappel, date_rappel, creneau_rappel, souhaite_plaquette
      FROM demandes_partenaires
      ORDER BY date_creation DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

function parseMaybeJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

async function statistiquesColocation(req, res, next) {
  try {
    const rows = await query(`
      SELECT a.id_annonce,
             a.date_creation,
             a.quartier,
             a.type_propriete,
             a.type_annonce,
             a.total_colocataires,
             a.surface_totale,
             a.internet,
             a.parking_voitures,
             a.parking_motos,
             a.parking_couvert,
             a.services_communs,
             ch.surface AS chambre_surface,
             ch.est_meuble,
             ch.prix_loyer,
             ch.prix_charges,
             ch.date_disponibilite,
             GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS commodites,
             GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS regles
      FROM annonces a
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      GROUP BY a.id_annonce
      ORDER BY a.date_creation DESC
    `);

    const items = rows.map((row) => {
      const commodites = String(row.commodites || '')
        .split('||')
        .map((value) => value.trim())
        .filter(Boolean);
      const regles = String(row.regles || '')
        .split('||')
        .map((value) => value.trim())
        .filter(Boolean);
      const servicesCommuns = parseMaybeJson(row.services_communs);
      const loyer = Number(row.prix_loyer || 0);
      const charges = Number(row.prix_charges || 0);
      const type = String(row.type_propriete || 'autre').toLowerCase();
      const typeLabel = type === 'maison' ? 'Maison' : type === 'appartement' ? 'Appartement' : 'Autre';
      const annonceLabel = String(row.type_annonce || 'existante').toLowerCase() === 'creation' ? 'Création' : 'Colocation existante';
      const rulesText = [...regles, ...servicesCommuns].filter(Boolean);

      return {
        id: String(row.id_annonce),
        date: row.date_creation ? String(row.date_creation).slice(0, 10) : '',
        quartier: row.quartier || 'Non renseigné',
        type: typeLabel,
        annonce: annonceLabel,
        nbColocs: Number(row.total_colocataires || 0),
        surface: Number(row.surface_totale || 0),
        surfChambre: Number(row.chambre_surface || 0),
        loyer: loyer || 0,
        charges: charges || 0,
        caution: loyer || 0,
        meuble: row.est_meuble || 'Non',
        internet: row.internet || 'Aucune',
        parkingVoit: Number(row.parking_voitures || 0),
        parking2r: Number(row.parking_motos || 0),
        commod: commodites,
        svck: servicesCommuns.length ? servicesCommuns : rulesText.filter((value) => /service|gardien|ménage|jardinier|intendance|eau|parking/i.test(String(value))),
        filles: rulesText.some((value) => /fille|filles|girls/i.test(String(value))),
        garcons: rulesText.some((value) => /garcon|garcons|boys/i.test(String(value))),
        animaux: rulesText.some((value) => /animal|animaux|chien|chat|chien|chat/i.test(String(value))),
        fumeurs: rulesText.some((value) => /fumeur|fume|non-fumeur/i.test(String(value))),
      };
    });

    res.json({ items, generatedAt: new Date().toISOString(), total: items.length });
  } catch (err) {
    next(err);
  }
}

async function deletePartenaireRequest(req, res, next) {
  try {
    await query('DELETE FROM demandes_partenaires WHERE id_demande = ?', [req.params.id]);
    await logAction(req, 'Correction', 'demande_partenaire', req.params.id, { operation: 'suppression' });
    res.json({ message: 'Demande de partenariat supprimee.' });
  } catch (err) {
    next(err);
  }
}

async function partenaires(req, res, next) {
  try {
    const rows = await query('SELECT * FROM partenaires ORDER BY actif DESC, niveau DESC, nom ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createPartenaire(req, res, next) {
  try {
    const { nom, secteur, niveau, remise, engagement, logo, actif = 1 } = req.body;
    if (!nom) return res.status(400).json({ message: 'Nom requis.' });
    const id = await insertAndGetId(
      'INSERT INTO partenaires (nom, secteur, niveau, remise, engagement, logo, actif) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nom, secteur || null, niveau || null, remise || null, engagement || null, logo || null, actif ? 1 : 0]
    );
    await logAction(req, 'Creation', 'partenaire', id, { operation: 'creation' });
    res.status(201).json({ id_partenaire: id });
  } catch (err) {
    next(err);
  }
}

async function updatePartenaire(req, res, next) {
  try {
    const allowed = ['nom', 'secteur', 'niveau', 'remise', 'engagement', 'logo', 'actif'];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ message: 'Aucune modification fournie.' });
    values.push(req.params.id);
    await query(`UPDATE partenaires SET ${sets.join(', ')} WHERE id_partenaire = ?`, values);
    await logAction(req, 'Correction', 'partenaire', req.params.id, req.body);
    res.json({ message: 'Partenaire mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function deletePartenaire(req, res, next) {
  try {
    await query('DELETE FROM partenaires WHERE id_partenaire = ?', [req.params.id]);
    await logAction(req, 'Correction', 'partenaire', req.params.id, { operation: 'suppression' });
    res.json({ message: 'Partenaire supprime.' });
  } catch (err) {
    next(err);
  }
}

async function contrats(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const rows = await query(
      `SELECT c.*, a.titre, a.quartier, v.nom_ville,
              COUNT(pc.id) AS parties_count
       FROM contrats c
       JOIN annonces a ON a.id_annonce = c.id_annonce
       JOIN villes v ON v.id_ville = a.id_ville
       LEFT JOIN parties_contrats pc ON pc.id_contrat = c.id_contrat
       GROUP BY c.id_contrat
       ORDER BY c.date_creation DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function contratDetails(req, res, next) {
  try {
    const rows = await query('SELECT * FROM contrats WHERE id_contrat = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Contrat introuvable.' });
    const parties = await query('SELECT * FROM parties_contrats WHERE id_contrat = ? ORDER BY role, id', [req.params.id]);
    res.json({ ...rows[0], parties });
  } catch (err) {
    next(err);
  }
}

async function saveContrat(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const { reference, id_annonce, type = 'contrat', statut = 'a-emettre', montant_total, parties = [] } = req.body;
    let id = req.params.id;
    if (!id_annonce) return res.status(400).json({ message: 'Annonce requise.' });
    if (id) {
      await query(
        'UPDATE contrats SET reference = ?, id_annonce = ?, type = ?, statut = ?, montant_total = ? WHERE id_contrat = ?',
        [reference, id_annonce, type, statut, montant_total || null, id]
      );
      await query('DELETE FROM parties_contrats WHERE id_contrat = ?', [id]);
    } else {
      id = await insertAndGetId(
        'INSERT INTO contrats (reference, id_annonce, type, statut, montant_total) VALUES (?, ?, ?, ?, ?)',
        [reference || `CT-${Date.now().toString().slice(-8)}`, id_annonce, type, statut, montant_total || null]
      );
    }
    for (const partie of parties) {
      await query(
        `INSERT INTO parties_contrats (id_contrat, id_utilisateur, nom_complet, role, cin, telephone, email, commentaire)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, partie.id_utilisateur || null, partie.nom_complet || null, partie.role || 'locataire', partie.cin || null, partie.telephone || null, partie.email || null, partie.commentaire || null]
      );
    }
    await logAction(req, 'Correction', 'contrat', id, { statut });
    res.json({ id_contrat: Number(id), message: 'Contrat enregistre.' });
  } catch (err) {
    next(err);
  }
}

async function contratAction(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const statusByAction = { signer: 'signe', envoyer: 'envoye', emettre: 'emis' };
    const statut = statusByAction[req.params.action];
    if (!statut) return res.status(400).json({ message: 'Action invalide.' });
    await query(
      'UPDATE contrats SET statut = ?, date_emission = IF(? IN ("emis","envoye"), COALESCE(date_emission, NOW()), date_emission) WHERE id_contrat = ?',
      [statut, statut, req.params.id]
    );
    if (req.params.action === 'envoyer') {
      const parties = await query('SELECT id_utilisateur FROM parties_contrats WHERE id_contrat = ? AND id_utilisateur IS NOT NULL', [req.params.id]);
      for (const partie of parties) {
        await query(
          `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
           VALUES (?, 'systeme', 'Contrat disponible', 'Un contrat est disponible pour signature.', ?)`,
          [partie.id_utilisateur, `/contrats/${req.params.id}`]
        ).catch(() => {});
      }
    }
    await logAction(req, req.params.action === 'signer' ? 'Signature' : 'Message', 'contrat', req.params.id, { statut });
    res.json({ message: 'Contrat mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function partenairesStats(req, res, next) {
  try {
    const [regions, proprietaires, total] = await Promise.all([
      query(`SELECT r.nom_region, COUNT(a.id_annonce) AS total_annonces
             FROM regions r
             LEFT JOIN villes v ON v.id_region = r.id_region
             LEFT JOIN annonces a ON a.id_ville = v.id_ville
             GROUP BY r.id_region
             ORDER BY total_annonces DESC, r.nom_region ASC`),
      query(`SELECT u.id_utilisateur, u.nom, u.prenom, u.email, COUNT(a.id_annonce) AS total_annonces
             FROM utilisateurs u
             JOIN roles ro ON ro.id_role = u.id_role
             LEFT JOIN annonces a ON a.id_utilisateur = u.id_utilisateur
             WHERE ro.nom_role IN ('proprio','agent','admin','super_admin')
             GROUP BY u.id_utilisateur
             ORDER BY total_annonces DESC, u.nom ASC`),
      query('SELECT COUNT(*) AS total_annonces FROM annonces'),
    ]);
    res.json({ totalAnnonces: Number(total[0]?.total_annonces || 0), regions, proprietaires });
  } catch (err) {
    next(err);
  }
}

async function administration(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const [versements, objectifs, configuration, performance, statsColoc] = await Promise.all([
      query(`SELECT p.*, u.nom, u.prenom, a.titre AS annonce_titre
             FROM paiements p
             JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
             LEFT JOIN annonces a ON a.id_annonce = p.id_annonce
             ORDER BY p.date_paiement DESC LIMIT 300`),
      query('SELECT * FROM objectifs_equipe ORDER BY date_creation DESC LIMIT 100'),
      query('SELECT * FROM configuration_backoffice ORDER BY cle ASC'),
      query(`SELECT
               (SELECT COUNT(*) FROM annonces WHERE statut='active') AS annonces_actives,
               (SELECT COUNT(*) FROM utilisateurs WHERE statut='active') AS utilisateurs_actifs,
               (SELECT COUNT(*) FROM messages WHERE DATE(date_envoi)=CURDATE()) AS messages_jour,
               (SELECT COUNT(*) FROM signalements WHERE statut IN ('new','in_progress')) AS signalements_ouverts`),
      query(`SELECT r.nom_region, COUNT(DISTINCT a.id_annonce) AS annonces, COUNT(DISTINCT c.id_candidature) AS candidatures
             FROM regions r
             LEFT JOIN villes v ON v.id_region = r.id_region
             LEFT JOIN annonces a ON a.id_ville = v.id_ville
             LEFT JOIN candidatures c ON c.id_annonce = a.id_annonce
             GROUP BY r.id_region
             ORDER BY annonces DESC`),
    ]);
    res.json({ versements, objectifs, configuration, performance: performance[0] || {}, statistiquesColocation: statsColoc });
  } catch (err) {
    next(err);
  }
}

async function backofficePerformance(req, res, next) {
  try {
    const [summary, tauxValidation, contratsMois, chiffreAffairesMois, candidaturesMois] = await Promise.all([
      query(`SELECT
               (SELECT COUNT(*) FROM annonces WHERE statut='active') AS annonces_actives,
               (SELECT COUNT(*) FROM utilisateurs WHERE statut='active') AS utilisateurs_actifs,
               (SELECT COUNT(*) FROM messages WHERE DATE(date_envoi)=CURDATE()) AS messages_jour,
               (SELECT COUNT(*) FROM signalements WHERE statut IN ('new','in_progress')) AS signalements_ouverts
             `),
      query(`SELECT ROUND(100 * SUM(CASE WHEN statut = 'active' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS taux_validation FROM annonces`),
      query(`SELECT COUNT(*) AS contrats_mois FROM contrats WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())`),
      query(`SELECT COALESCE(SUM(montant_recu), 0) AS chiffre_affaires_mois FROM paiements WHERE MONTH(date_paiement) = MONTH(CURDATE()) AND YEAR(date_paiement) = YEAR(CURDATE()) AND statut IN ('conforme','valide')`),
      query(`SELECT COUNT(*) AS candidatures_mois FROM candidatures WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())`),
    ])

    res.json({
      annonces_actives: Number(summary[0]?.annonces_actives || 0),
      utilisateurs_actifs: Number(summary[0]?.utilisateurs_actifs || 0),
      messages_jour: Number(summary[0]?.messages_jour || 0),
      signalements_ouverts: Number(summary[0]?.signalements_ouverts || 0),
      taux_validation: Number(tauxValidation[0]?.taux_validation || 0),
      contrats_mois: Number(contratsMois[0]?.contrats_mois || 0),
      chiffre_affaires_mois: Number(chiffreAffairesMois[0]?.chiffre_affaires_mois || 0),
      candidatures_mois: Number(candidaturesMois[0]?.candidatures_mois || 0),
    });
  } catch (err) {
    next(err);
  }
}

async function backofficePaiements(req, res, next) {
  try {
    const rows = await query(`
      SELECT p.*, u.nom, u.prenom, a.titre AS annonce_titre
      FROM paiements p
      JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
      LEFT JOIN annonces a ON a.id_annonce = p.id_annonce
      ORDER BY p.date_paiement DESC
      LIMIT 300
    `)
    res.json(rows)
  } catch (err) {
    next(err)
  }
}

async function updatePaiementStatus(req, res, next) {
  try {
    const { statut } = req.body;
    const allowed = ['a-verifier', 'conforme', 'non-conforme', 'en-attente', 'valide', 'echoue'];
    if (!allowed.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    await query('UPDATE paiements SET statut = ? WHERE id_paiement = ?', [statut, req.params.id]);
    await logAction(req, 'Correction', 'paiement', req.params.id, { statut });
    res.json({ message: 'Paiement mis à jour.' });
  } catch (err) {
    next(err);
  }
}

async function saveConfiguration(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const { cle, valeur } = req.body;
    if (!cle) return res.status(400).json({ message: 'Cle requise.' });
    await query(
      'INSERT INTO configuration_backoffice (cle, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), date_modification = NOW()',
      [cle, JSON.stringify(valeur ?? null)]
    );
    await logAction(req, 'Correction', 'configuration', null, { cle });
    res.json({ message: 'Configuration enregistree.' });
  } catch (err) {
    next(err);
  }
}

async function saveObjectif(req, res, next) {
  try {
    await ensureBackofficeSchema();
    const { libelle, objectif = 0, realise = 0, periode = 'mois', statut = 'actif' } = req.body;
    let id = req.params.id;
    if (!libelle) return res.status(400).json({ message: 'Libelle requis.' });
    if (id) {
      await query('UPDATE objectifs_equipe SET libelle=?, objectif=?, realise=?, periode=?, statut=? WHERE id_objectif=?', [libelle, objectif, realise, periode, statut, id]);
    } else {
      id = await insertAndGetId('INSERT INTO objectifs_equipe (libelle, objectif, realise, periode, statut) VALUES (?, ?, ?, ?, ?)', [libelle, objectif, realise, periode, statut]);
    }
    await logAction(req, 'Correction', 'objectif', id, { libelle, objectif, realise });
    res.json({ id_objectif: Number(id), message: 'Objectif enregistre.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  queue,
  members,
  stats,
  moderateAnnonce,
  moderateMember,
  signalements,
  signalementConversation,
  updateSignalement,
  warningReasons,
  sendWarning,
  conversations,
  conversationMessages,
  contactMessages,
  deleteContactMessage,
  replyContactMessage,
  journal,
  suiviMissions,
  servicesCkoo,
  createServiceCkoo,
  updateServiceCkoo,
  deleteServiceCkoo,
  backofficePaiements,
  updatePaiementStatus,
  contrats,
  contratDetails,
  saveContrat,
  contratAction,
  partenaireRequests,
  deletePartenaireRequest,
  statistiquesColocation,
  partenaires,
  createPartenaire,
  updatePartenaire,
  deletePartenaire,
  partenairesStats,
  administration,
  backofficePerformance,
  saveConfiguration,
  createMember,
  updateMember,
  deleteMember,
  saveObjectif,
};
