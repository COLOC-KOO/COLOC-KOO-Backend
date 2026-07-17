const router = require('express').Router();
const { query } = require('../Services/db.service');
const mail = require('../Services/mail.service');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

// ============================================================
// ROUTE POUR ENVOYER L'EMAIL DU CONTRAT
// ============================================================

// POST /api/contrats/:id/email
router.post('/:id/email', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'contrat', message, sujet } = req.body;

    console.log(`📧 Envoi d'email pour le contrat ${id}`);

    // 1. Récupérer le contrat
    const [contrat] = await query(
      `SELECT c.* 
       FROM contrats c
       WHERE c.id_contrat = ?`,
      [id]
    );

    if (!contrat) {
      console.log(`❌ Contrat ${id} non trouvé`);
      return res.status(404).json({ error: 'Contrat non trouvé' });
    }

    // 2. Récupérer les parties avec leurs emails
    const parties = await query(
      `SELECT 
        p.*,
        u.email,
        u.nom,
        u.prenom,
        CONCAT(u.prenom, ' ', u.nom) as nom_complet
       FROM parties_contrats p
       LEFT JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
       WHERE p.id_contrat = ?`,
      [id]
    );

    console.log(`📋 ${parties.length} parties trouvées`);

    // 3. Filtrer les emails valides
    const emails = parties
      .filter(p => p.email && p.email.trim() !== '')
      .map(p => p.email);

    console.log(`📧 ${emails.length} emails valides:`, emails);

    if (emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun email disponible pour les parties'
      });
    }

    // 4. Construire le contenu de l'email
    const sujetEmail = sujet || `Document ${type === 'contrat' ? 'Contrat' : 'État des lieux'} - ${contrat.reference || id}`;

    const partiesList = parties.map(p =>
      `<li><strong>${p.nom_complet || p.nom || 'Participant'}</strong> (${p.role || 'Partie'})</li>`
    ).join('');

    let contenu = `
      <p>Bonjour,</p>
      <p>Un document <strong>${type === 'contrat' ? 'contrat' : 'état des lieux'}</strong> vous a été envoyé.</p>
      <p><strong>Référence :</strong> ${contrat.reference || id}</p>
      <p><strong>Parties concernées :</strong></p>
      <ul>${partiesList}</ul>
    `;

    if (contrat.montant_total) {
      contenu += `
        <p><strong>Montant :</strong> ${Number(contrat.montant_total).toLocaleString('fr-FR')} MGA</p>
      `;
    }

    if (message) {
      contenu += `
        <p><strong>Message :</strong></p>
        <blockquote style="background:#f3f4f6;padding:10px;border-radius:4px;">${message}</blockquote>
      `;
    }

    contenu += `
      <p>Veuillez consulter le document dans votre espace personnel.</p>
      <p>---</p>
      <p style="font-size:12px;color:#6b7280;">L'équipe Coloc'KOO</p>
    `;

    // 5. Utiliser votre service d'email existant
    const html = mail.wrapLayout(sujetEmail, contenu);
    await mail.sendEmail(emails, sujetEmail, html, `Document ${contrat.reference || id}`);

    console.log(`✅ Email envoyé avec succès à ${emails.length} destinataires`);

    res.json({
      success: true,
      message: `Email envoyé à ${emails.length} destinataire(s)`,
      destinataires: emails,
      count: emails.length
    });

  } catch (error) {
    console.error('❌ Erreur envoi email contrat:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'envoi de l\'email'
    });
  }
});

module.exports = router;