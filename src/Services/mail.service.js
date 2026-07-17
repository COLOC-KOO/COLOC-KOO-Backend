const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

// Couleurs de marque (reutilisees par tous les gabarits).
const BRAND = {
  primaire: '#0f766e', // teal Coloc'KOO
  texte: '#1f2937',
  gris: '#6b7280',
  bordure: '#e5e7eb',
  fond: '#f9fafb',
};

// true si les identifiants SMTP minimaux sont presents dans le .env.
function isConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Base URL du front, sans slash final (pour liens absolus dans les emails).
function appBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

// Transporteur nodemailer mis en cache (cree une seule fois).
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465, // 465 = SSL implicite ; 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

// --- Helpers de composition (gabarit commun) -------------------------------

// Enrobe `contenuHtml` dans le gabarit de marque Coloc'KOO (en-tete + pied).
// A utiliser pour TOUT email afin d'avoir un rendu homogene.
function wrapLayout(titre, contenuHtml) {
  const annee = new Date().getFullYear();
  return `
  <div style="background:${BRAND.fond};padding:24px 0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.bordure};border-radius:12px;overflow:hidden">
      <div style="background:${BRAND.primaire};padding:18px 24px">
        <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px">Coloc'KOO</span>
        <span style="color:#d1fae5;font-size:12px;margin-left:8px">Payer moins pour vivre mieux</span>
      </div>
      <div style="padding:24px;color:${BRAND.texte};line-height:1.55">
        <h2 style="margin:0 0 14px;font-size:19px;color:${BRAND.texte}">${titre}</h2>
        ${contenuHtml}
      </div>
      <div style="padding:14px 24px;border-top:1px solid ${BRAND.bordure};color:${BRAND.gris};font-size:12px">
        Email automatique — Coloc'KOO SARL · &copy; ${annee}. Merci de ne pas repondre.
      </div>
    </div>
  </div>`;
}

// Tableau "libelle / valeur". `rows` = [[libelle, valeur], ...].
function detailsTable(rows) {
  const trs = rows
    .filter((r) => Array.isArray(r) && r[1] !== undefined && r[1] !== null && r[1] !== '')
    .map(
      ([libelle, valeur]) =>
        `<tr>
           <td style="padding:5px 14px 5px 0;color:${BRAND.gris};vertical-align:top">${libelle}</td>
           <td style="padding:5px 0;color:${BRAND.texte}">${valeur}</td>
         </tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:12px 0;width:100%">${trs}</table>`;
}

// Bouton-lien. `path` relatif ("/admin/...") => prefixe par APP_BASE_URL ;
// une URL absolue (http...) est laissee telle quelle.
function actionButton(label, path) {
  const href = /^https?:\/\//i.test(path) ? path : `${appBaseUrl()}${path}`;
  return `<p style="margin:20px 0 4px">
    <a href="${href}" style="display:inline-block;background:${BRAND.primaire};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:14px">${label}</a>
  </p>`;
}
async function sendEmail(to, sujet, html, text) {
  if (!isConfigured()) {
    console.warn('[mail] SMTP non configure (SMTP_USER/SMTP_PASS vides) — email ignore:', sujet);
    return false;
  }
  const destinataires = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!destinataires.length) return false;

  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: destinataires.join(', '),
      subject: sujet,
      html,
      text: text || undefined,
    });
    return true;
  } catch (err) {
    console.error('[mail] Echec envoi email:', err.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  isConfigured,
  wrapLayout,
  detailsTable,
  actionButton,
  appBaseUrl,
  BRAND,
};
