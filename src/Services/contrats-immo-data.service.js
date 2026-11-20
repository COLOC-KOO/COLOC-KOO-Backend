const { renderContratsImmoDocx, convertContratsImmoDocxToPdf } = require('./contrats-immo-template.service');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PDFDocument = require('pdfkit');
const execFileAsync = promisify(execFile);

const TEMPLATE_BY_PROFILE = Object.freeze({
  locataire: 'contrat_intercolocs',
  proprietaire: 'contrat_propriocolocs',
  professionnel: 'contrat_mandacolocs',
});

function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function amount(value) {
  if (String(value ?? '').trim() === '') return '';
  const number = Number(String(value || '').replace(/\D/g, ''));
  return Number.isFinite(number) ? Math.round(number).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, '.') : '';
}

function wordsUnderThousand(number) {
  const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  if (number <= 16) return units[number];
  if (number < 20) return `dix-${units[number - 10]}`;
  const tens = Math.floor(number / 10) * 10;
  const rest = number % 10;
  if (number < 70) return `${['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][Math.floor(number / 10)]}${rest ? (rest === 1 ? ' et un' : `-${units[rest]}`) : ''}`;
  if (number < 80) return number === 71 ? 'soixante et onze' : `soixante-${wordsUnderThousand(number - 60)}`;
  if (number < 100) return `quatre-vingt${rest ? `-${wordsUnderThousand(rest)}` : 's'}`;
  const hundreds = Math.floor(number / 100);
  const remaining = number % 100;
  return `${hundreds === 1 ? 'cent' : `${units[hundreds]} cent${remaining ? '' : 's'}`}${remaining ? ` ${wordsUnderThousand(remaining)}` : ''}`;
}

function amountInWords(value) {
  if (String(value ?? '').trim() === '') return '';
  let number = Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')));
  if (!Number.isFinite(number) || number < 0 || number > 999999999) return '';
  if (number === 0) return 'zéro ariary';
  const parts = [];
  const millions = Math.floor(number / 1_000_000);
  const thousands = Math.floor((number % 1_000_000) / 1000);
  const rest = number % 1000;
  if (millions) parts.push(`${millions === 1 ? 'un' : amountInWords(millions).replace(/ ariary$/, '')} million${millions > 1 ? 's' : ''}`);
  if (thousands) parts.push(`${thousands === 1 ? '' : `${wordsUnderThousand(thousands)} `}mille`);
  if (rest) parts.push(wordsUnderThousand(rest));
  return `${parts.join(' ')} ariary`;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTextRows(value, fields) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    return Object.fromEntries(fields.map((field, index) => [field, parts[index] || '']));
  });
}

async function combinePdfBuffers(pdfBuffers) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'colockoo-immo-bundle-'));
  const outputPath = path.join(directory, 'bundle.pdf');
  try {
    const inputPaths = [];
    for (let index = 0; index < pdfBuffers.length; index += 1) {
      const inputPath = path.join(directory, `document-${index + 1}.pdf`);
      await fs.writeFile(inputPath, pdfBuffers[index], { mode: 0o600 });
      inputPaths.push(inputPath);
    }
    await execFileAsync(process.env.GS_BIN || 'gs', [
      '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
      `-sOutputFile=${outputPath}`, ...inputPaths,
    ], { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });
    const combined = await fs.readFile(outputPath);
    if (!combined.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Ghostscript n’a pas assemblé les PDF du dossier.');
    return combined;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function annexCoverPdf(title) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 54 });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#243746')
      .text(title, 54, 340, { width: 487, align: 'center' });
    pdf.font('Helvetica').fontSize(10).fillColor('#667085')
      .text('Document signé joint au contrat de colocation.', 54, 390, { width: 487, align: 'center' });
    pdf.end();
  });
}

function cashReceiptPdf(data) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    const drawReceipt = (top) => {
      pdf.font('Helvetica-Bold').fontSize(14).text('ATTESTATION DE REMISE EN ESPECES', 45, top, { align: 'center', width: 505 });
      pdf.font('Helvetica').fontSize(10);
      pdf.text(`Remettant : ${data.nom_demandeur || ''}`, 55, top + 38);
      pdf.text(`Beneficiaire : ${data.nom_autre_partie || ''}`, 55, top + 57);
      const amount = String(data.especes_montant || '').trim();
      const reason = String(data.especes_motif || '').trim();
      const city = String(data.especes_ville || '').trim();
      const date = displayDate(data.especes_date);
      pdf.text(`Montant remis : ${amount || '________________________'} Ariary`, 55, top + 85);
      pdf.text(`Motif : ${reason || '___________________________________________________'}`, 55, top + 108);
      pdf.text(`Fait a ${city || '______________________________'}, le ${date || '____ / ____ / ______'}`, 55, top + 131);
      pdf.text('Signature du remettant', 75, top + 170);
      pdf.text('Signature du beneficiaire', 330, top + 170);
      pdf.moveTo(55, top + 215).lineTo(260, top + 215).stroke();
      pdf.moveTo(310, top + 215).lineTo(515, top + 215).stroke();
      pdf.rect(45, top - 8, 505, 240).strokeColor('#7b8794').stroke();
    };
    drawReceipt(35);
    drawReceipt(430);
    pdf.end();
  });
}

function buildTemplateData({ type, profile, data, reference }) {
  const supplied = data && typeof data === 'object' ? data : {};
  const result = Object.fromEntries(Object.entries(supplied).map(([key, value]) => {
    if (typeof value !== 'string') return [key, value];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return [key, displayDate(value)];
    if (value === 'true') return [key, true];
    if (value === 'false') return [key, false];
    return [key, value];
  }));
  const get = (...keys) => {
    for (const key of keys) if (supplied[key] != null && String(supplied[key]).trim()) return String(supplied[key]).trim();
    return '';
  };
  if (typeof supplied.sous_occupants_texte === 'string') {
    result.sous_occupants = parseTextRows(supplied.sous_occupants_texte, ['so_nom', 'so_date_contrat']);
  }
  if (typeof supplied.repartition_texte === 'string') {
    result.repartition = parseTextRows(supplied.repartition_texte, ['repartition_habitant', 'repartition_chambre', 'repartition_montant']);
  }
  const person = (prefix, source) => {
    const fullName = get(`${source}_nom_complet`, `nom_${source}`, `${source}_nom_prenom`);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    result[`${prefix}_nom`] = get(`${source}_nom`) || nameParts.slice(1).join(' ') || fullName;
    result[`${prefix}_prenom`] = get(`${source}_prenom`) || (nameParts.length > 1 ? nameParts[0] : '');
    result[`${prefix}_date_naissance`] = displayDate(get(`${source}_date_naissance`, `date_naissance_${source}`));
    result[`${prefix}_ville_naissance`] = get(`${source}_ville_naissance`, `ville_naissance_${source}`);
    result[`${prefix}_pays_naissance`] = get(`${source}_pays_naissance`, `pays_naissance_${source}`);
    result[`${prefix}_piece_identite`] = get(`${source}_piece_identite`, `${source}_cin`, `cin_${source}`);
    result[`${prefix}_telephone`] = get(`${source}_telephone`, `telephone_${source}`);
    result[`${prefix}_email`] = get(`${source}_email`, `email_${source}`);
  };
  result.reference = reference || '';
  result.fait_a = '';
  result.fait_le = '';
  result.date_effet = displayDate(get('date_effet', 'date_entree'));
  result.logement_adresse = get('logement_adresse', 'adresse');
  result.logement_code_postal = get('logement_code_postal', 'code_postal');
  result.logement_ville = get('logement_ville', 'ville');
  result.logement_typologie = get('logement_typologie', 'type_bien');
  result.logement_description = get('logement_description', 'description_logement', 'observations');
  result.duree_bail = get('duree_bail', 'bail_duree', 'type_bail');
  result.loyer_jour_paiement = get('loyer_jour_paiement', 'jour_paiement');
  result.preavis_bailleur_mois = get('preavis_bailleur_mois', 'preavis_bailleur');
  result.revision_pourcentage = get('revision_pourcentage', 'taux_revision');
  result.revision_periodicite_annees = get('revision_periodicite_annees', 'periodicite_revision');
  result.bail_date_effet = displayDate(get('bail_date_effet', 'bail_principal_date_effet'));
  result.bail_date_fin = displayDate(get('bail_date_fin', 'bail_principal_date_fin'));
  result.bail_duree_annees = get('bail_duree_annees', 'bail_principal_duree');
  result.bail_article = get('bail_article', 'bail_principal_article');
  result.bail_proprietaire_nom = get('bail_proprietaire_nom', 'bail_principal_proprietaire');
  result.mandat_date = displayDate(get('mandat_date', 'date_mandat'));
  result.modes_reglement = get('modes_reglement');
  result.loyer_montant = amount(get('loyer_montant', 'loyer'));
  result.loyer_montant_lettres = get('loyer_montant_lettres') || amountInWords(get('loyer_montant', 'loyer'));
  const chargeRows = parseList(supplied.charges_lignes || supplied.charges).length
    ? parseList(supplied.charges_lignes || supplied.charges)
    : parseTextRows(supplied.charges_lignes_texte, ['charge_nom', 'charge_montant', 'charge_repartition', 'charge_description']);
  const lineChargeTotal = chargeRows.reduce((sum, row) => sum + Number(String(row.charge_montant || row.charge_repartition || '').replace(/\D/g, '')), 0);
  const chargeTotal = get('charges_total') || (lineChargeTotal ? String(lineChargeTotal) : get('charges'));
  result.charges = chargeRows.length ? chargeRows : (Number(chargeTotal) > 0 ? [{
    charge_nom: get('charge_nom') || 'Charges mensuelles',
    charge_repartition: amount(chargeTotal),
    charge_description: get('charge_description'),
  }] : []);
  result.charges_total = amount(chargeTotal);
  result.charges_total_lettres = get('charges_total_lettres') || amountInWords(chargeTotal);
  const depositAmount = (Number(get('mois_depot')) * Number(get('loyer_montant', 'loyer'))) || Number(get('depot_montant', 'caution'));
  result.depot_montant = amount(depositAmount);
  result.depot_montant_lettres = get('depot_montant_lettres') || amountInWords(depositAmount);
  result.revision_date_anniversaire = displayDate(get('revision_date_anniversaire', 'date_entree'));
  result.niveaux = parseList(supplied.niveaux).length
    ? parseList(supplied.niveaux)
    : parseTextRows(supplied.niveaux_texte, ['niveau_libelle', 'niveau_description']);
  result.regime_solidaire = ['solidaire', 'collective', 'avec', 'oui'].includes(get('solidarite', 'regime_responsabilite').toLowerCase());
  result.gestionnaire_nom_prenom = profile === 'professionnel'
    ? get('nom_entreprise', 'mandataire_denomination', 'nom_demandeur')
    : get('nom_demandeur');
  result.gestionnaire_piece_identite = get('cin_demandeur');
  result.gestionnaire_contact = get('telephone_demandeur', 'email_demandeur');
  result.gestionnaire_date_naissance = displayDate(get('date_naissance_demandeur'));
  result.gestionnaire_qualite = profile === 'locataire' ? 'Occupant principal' : profile === 'proprietaire' ? 'Propriétaire' : 'Mandataire';
  result.gestionnaire_proprietaire = profile === 'proprietaire';
  result.gestionnaire_occupant_principal = profile === 'locataire';
  result.gestionnaire_mandataire = profile === 'professionnel';
  result.espace_meuble = ['oui', 'meuble'].includes(get('meuble', 'espace_meuble').toLowerCase());
  result.charges_avec = get('charges_avec')
    ? get('charges_avec').toLowerCase() === 'oui'
    : result.charges.length > 0 || Number(get('charges')) > 0;
  result.edl_type = get('edl_type') || 'd’entrée';
  result.edl_sdd = ['oui', 'true', '1'].includes(get('salle_bain_privee', 'edl_sdd').toLowerCase());
  const truthy = new Set(['oui', 'true', '1', 'avec', 'solidaire', 'actif']);
  const falsy = new Set(['non', 'false', '0', 'sans', 'individuelle', 'inactif']);
  for (const key of [
    'regime_solidaire', 'espace_meuble', 'charges_avec', 'bailleur_societe', 'edl_sdd',
    'represente_par_mandataire', 'retribution_aucune', 'retribution_marge', 'retribution_reduction',
    'revocation_un_mois', 'validation_proprietaire', 'retribution_reconduite', 'op_nouveau_etait_sous_occupant',
    'gestionnaire_proprietaire', 'gestionnaire_occupant_principal', 'gestionnaire_mandataire',
    'tranquillite_21h_6h', 'invites_3_6', 'menage_planning', 'tabac_exterieur',
    'tabac_interieur_communs', 'tabac_interieur_privatifs', 'tabac_espaces_designes',
    'depot_par_colocataire', 'mandat_duree_3_ans', 'mandataire_agrement', 'mandataire_rc_pro',
    'pouvoir_entrees_sorties', 'pouvoir_etats_des_lieux', 'pouvoir_gestion_courante', 'pouvoir_perception',
    'pouvoir_selection', 'remu_mensuelle_forfait', 'remu_ponctuelle_aucune', 'remu_ponctuelle_forfait',
    'remu_ponctuelle_pourcentage', 'repartition',
  ]) {
    if (typeof result[key] === 'string') {
      const normalized = result[key].trim().toLowerCase();
      if (truthy.has(normalized)) result[key] = true;
      else if (falsy.has(normalized)) result[key] = false;
    }
  }

  if (profile === 'locataire') {
    person('bailleur', 'demandeur');
    person('locataire', 'autre_partie');
  } else if (profile === 'proprietaire') {
    person('bailleur', 'demandeur');
    result.bailleur_denomination = get('bailleur_denomination', 'nom_entreprise', 'nom_demandeur');
    result.bailleur_representant = get('bailleur_representant', 'representant');
    result.bailleur_representant_qualite = get('bailleur_representant_qualite', 'representant_qualite');
    person('locataire', 'autre_partie');
    result.bailleur_societe = ['oui', 'true', '1'].includes(get('personne_morale').toLowerCase());
  } else {
    result.mandataire_denomination = get('mandataire_denomination', 'nom_entreprise', 'nom_demandeur');
    result.mandataire_forme_juridique = get('mandataire_forme_juridique', 'forme_juridique');
    result.mandataire_nif = get('mandataire_nif', 'nif');
    result.mandataire_rcs = get('mandataire_rcs', 'rcs');
    result.mandataire_stat = get('mandataire_stat', 'stat');
    result.mandataire_siege = get('mandataire_siege', 'adresse_entreprise');
    result.mandataire_representant = get('mandataire_representant', 'representant');
    result.proprietaire_nom = get('proprietaire_nom', 'nom_proprietaire');
    result.proprietaire_adresse = get('proprietaire_adresse', 'adresse_proprietaire');
    result.proprietaire_piece_identite = get('proprietaire_piece_identite', 'cin_proprietaire');
    person('locataire', 'autre_partie');
  }

  if (type === 'edl') {
    result.gestionnaire_nom_prenom = get('gestionnaire_nom_prenom', 'nom_demandeur');
    result.gestionnaire_piece_identite = get('gestionnaire_piece_identite', 'cin_demandeur');
    result.gestionnaire_contact = get('gestionnaire_contact', 'telephone_demandeur', 'email_demandeur');
    result.gestionnaire_qualite = profile === 'locataire' ? 'Occupant principal' : profile === 'proprietaire' ? 'Propriétaire' : 'Mandataire';
    result.locataire_nom = get('locataire_nom', 'nom_autre_partie');
    result.locataire_prenom = get('locataire_prenom');
    result.locataire_piece_identite = get('locataire_piece_identite', 'cin_autre_partie');
    result.locataire_telephone = get('locataire_telephone', 'telephone_autre_partie');
  }
  return result;
}

async function renderContratsImmoPdf(options) {
  const templateId = options.templateId || (options.type === 'edl' ? 'etat_des_lieux' : TEMPLATE_BY_PROFILE[options.profile]);
  if (!templateId) throw new Error('Aucun modèle Word ne correspond au profil sélectionné.');
  const templateEdits = options.templateEdits || {};
  const fields = buildTemplateData(options);
  const docxBuffer = renderContratsImmoDocx(templateId, fields, templateEdits[templateId]);
  const mainPdf = await convertContratsImmoDocxToPdf(docxBuffer);
  if (options.type !== 'contrat' || !Object.values(TEMPLATE_BY_PROFILE).includes(templateId)) {
    return { templateId, fields, docxBuffer, pdfBuffer: mainPdf };
  }
  const edlFields = buildTemplateData({ ...options, type: 'edl' });
  const edlDocx = renderContratsImmoDocx('etat_des_lieux', edlFields, templateEdits.etat_des_lieux);
  const edlPdf = await convertContratsImmoDocxToPdf(edlDocx);
  const documents = [];
  for (const annex of Array.isArray(options.annexes) ? options.annexes : []) {
    if (!Buffer.isBuffer(annex?.pdfBuffer)) continue;
    if (annex.title) documents.push(await annexCoverPdf(annex.title));
    documents.push(annex.pdfBuffer);
  }
  documents.push(mainPdf, edlPdf);
  const templateIds = [templateId, 'etat_des_lieux'];
  for (const [field, auxiliaryId] of [['inclure_charte', 'charte_colocation'], ['inclure_attestation_logement', 'attestation_logement']]) {
    if (options.data?.[field] !== 'oui') continue;
    const auxiliaryDocx = renderContratsImmoDocx(auxiliaryId, fields, templateEdits[auxiliaryId]);
    documents.push(await convertContratsImmoDocxToPdf(auxiliaryDocx));
    templateIds.push(auxiliaryId);
  }
  if (options.data?.inclure_attestation_especes === 'oui') {
    documents.push(await cashReceiptPdf(options.data));
    templateIds.push('attestation_remise_especes');
  }
  const pdfBuffer = await combinePdfBuffers(documents);
  return { templateId, templateIds, fields, docxBuffer, pdfBuffer };
}

module.exports = { TEMPLATE_BY_PROFILE, amount, amountInWords, buildTemplateData, renderContratsImmoPdf };
