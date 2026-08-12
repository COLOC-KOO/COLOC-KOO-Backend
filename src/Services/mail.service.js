const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');


const candidats = [
  path.join(__dirname, '.env'),               
  path.join(__dirname, '..', '.env'),          
  path.join(__dirname, '..', '..', '.env'),    
];
const envPath = candidats.find((p) => fs.existsSync(p));

if (envPath) {
  require('dotenv').config({ path: envPath, override: true });
  console.log('[mail] .env charge depuis :', envPath);
} else {
  console.warn('[mail] Aucun fichier .env trouve parmi :', candidats);
  require('dotenv').config(); 
}



let transporter = null;


const BRAND = {
  primaire: '#0f766e', 
  texte: '#1f2937',
  gris: '#6b7280',
  bordure: '#e5e7eb',
  fond: '#f9fafb',
};


function isConfigured() {
  const ok = Boolean(process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD);
  console.log('[mail] isConfigured() ->', ok);
  return ok;
}


function appBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  console.log('[mail] Creation du transporteur -> host:', process.env.SMTP_HOST || 'smtp.gmail.com', '| port:', port, '| secure:', port === 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, 
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  return transporter;
}


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

function actionButton(label, linkPath) {
  const href = /^https?:\/\//i.test(linkPath) ? linkPath : `${appBaseUrl()}${linkPath}`;
  return `<p style="margin:20px 0 4px">
    <a href="${href}" style="display:inline-block;background:${BRAND.primaire};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;font-size:14px">${label}</a>
  </p>`;
}

async function sendEmail(to, sujet, html, text) {
  console.log('[mail] sendEmail() appele -> destinataire:', to, '| sujet:', sujet);

  if (!isConfigured()) {
    console.warn('[mail] SMTP non configure (SMTP_EMAIL/SMTP_PASSWORD vides) — email ignore:', sujet);
    return false;
  }
  const destinataires = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!destinataires.length) {
    console.warn('[mail] Aucun destinataire valide, envoi annule.');
    return false;
  }

  try {
    console.log('[mail] Tentative d\'envoi en cours...');
    const info = await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_EMAIL,
      to: destinataires.join(', '),
      subject: sujet,
      html,
      text: text || undefined,
    });
    console.log('[mail] ✅ Email envoye avec succes. Message ID :', info.messageId);
    return true;
  } catch (err) {
    console.error('[mail] ❌ Echec envoi email. Message d\'erreur complet :', err.message);
    console.error('[mail] Code erreur :', err.code);
    console.error('[mail] Detail complet :', err);
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