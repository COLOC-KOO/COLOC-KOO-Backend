const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

const TEMPLATE_DIRECTORY = path.join(__dirname, '..', 'Templates', 'contrats-immo');
const execFileAsync = promisify(execFile);

const TEMPLATES = Object.freeze({
  autorisation_colocation: 'ColocKOO_Autorisation_de_colocation_balise.docx',
  avenant_substitution: 'ColocKOO_Avenant_de_substitution_balise.docx',
  charte_colocation: 'ColocKOO_Charte_de_colocation_balise.docx',
  contrat_intercolocs: 'ColocKOO_Contrat_Intercolocs_balise.docx',
  contrat_mandacolocs: 'ColocKOO_Contrat_Mandacolocs_balise.docx',
  contrat_propriocolocs: 'ColocKOO_Contrat_Propriocolocs_balise.docx',
  etat_des_lieux: 'ColocKOO_Etat_des_lieux_balise.docx',
  mandat_gestion: 'ColocKOO_Mandat_de_gestion_balise.docx',
  attestation_logement: 'ColocKOO_Attestation_de_logement_balise.docx',
});

const TEMPLATE_TITLES = Object.freeze({
  autorisation_colocation: 'Autorisation de colocation',
  avenant_substitution: 'Avenant de substitution',
  charte_colocation: 'Charte de colocation',
  contrat_intercolocs: 'Contrat Intercolocs',
  contrat_mandacolocs: 'Contrat Mandacolocs',
  contrat_propriocolocs: 'Contrat Propriocolocs',
  etat_des_lieux: 'État des lieux',
  mandat_gestion: 'Mandat de gestion',
  attestation_logement: 'Attestation de logement',
});

function decodeXmlText(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()];
  });
}

function encodeXmlText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXmlText(match[1])).join('');
}

function getTemplateParagraphs(templateId) {
  const filename = TEMPLATES[templateId];
  if (!filename) throw new Error(`Modèle Contrats Immo inconnu : ${templateId}`);
  const xml = new PizZip(fs.readFileSync(path.join(TEMPLATE_DIRECTORY, filename))).file('word/document.xml')?.asText();
  if (!xml) throw new Error('Le modèle Word ne contient pas de document principal valide.');
  const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((match) => paragraphText(match[0]));
  return paragraphs.map((text, index) => ({ index, text })).filter((item) => item.text.trim());
}

function validateTemplateEdits(templateId, edits) {
  const paragraphs = getTemplateParagraphs(templateId);
  const normalized = {};
  for (const [rawIndex, rawText] of Object.entries(edits || {})) {
    const index = Number(rawIndex);
    const paragraph = paragraphs.find((item) => item.index === index);
    if (!Number.isInteger(index) || !paragraph || typeof rawText !== 'string' || rawText.length > 5000) {
      throw new Error('Une modification de paragraphe est invalide.');
    }
    const original = paragraph.text;
    const tags = (value) => [...value.matchAll(/\{\{[#^/]?[^{}]+\}\}/g)].map((match) => match[0]).sort();
    if (JSON.stringify(tags(original)) !== JSON.stringify(tags(rawText))) {
      throw new Error('Les variables et conditions du modèle doivent rester inchangées.');
    }
    if (rawText !== original) normalized[index] = rawText;
  }
  return normalized;
}

function applyTemplateEdits(docxBuffer, edits) {
  if (!edits || typeof edits !== 'object' || !Object.keys(edits).length) return docxBuffer;
  const zip = new PizZip(docxBuffer);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Le modèle Word ne contient pas de document principal valide.');
  let index = 0;
  const xml = entry.asText().replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const replacement = edits[index];
    index += 1;
    if (replacement === undefined) return paragraph;
    let first = true;
    const next = paragraph.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g, (_match, open, close) => {
      if (first) {
        first = false;
        const textTag = /<w:t(?:\s[^>]*)?>/.exec(open)?.[0] || '<w:t>';
        const preservedTag = /xml:space=/.test(textTag) || !/^\s|\s$/.test(replacement)
          ? textTag
          : textTag.replace(/>$/, ' xml:space="preserve">');
        return `${preservedTag}${encodeXmlText(replacement)}${close}`;
      }
      return `${open.replace(/<w:t/, '<w:t')}${close}`;
    });
    return first ? paragraph : next;
  });
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Fill one supplied Word template.
 *
 * paragraphLoop removes paragraphs containing only a block opener/closer;
 * normal and inverted sections handle conditional content; loops placed in a
 * Word table row duplicate that row for each item in the supplied array.
 */
function renderContratsImmoDocx(templateId, data, templateEdits = {}) {
  const filename = TEMPLATES[templateId];
  if (!filename) throw new Error(`Modèle Contrats Immo inconnu : ${templateId}`);

  const templatePath = path.join(TEMPLATE_DIRECTORY, filename);
  const content = applyTemplateEdits(fs.readFileSync(templatePath), templateEdits);
  const zip = new PizZip(content);
  const document = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  document.render(data || {});
  return document.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

function converterDiagnostics(result) {
  return [result && result.stderr, result && result.stdout]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

function conversionFailed(message, { reason, stderr } = {}) {
  const details = [message, stderr].filter(Boolean).join(' ');
  const error = new Error(details);
  error.code = 'PDF_CONVERSION_FAILED';
  if (reason) error.reason = reason;
  return error;
}

async function convertContratsImmoDocxToPdf(docxBuffer) {
  const workDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-immo-'));
  const inputPath = path.join(workDirectory, 'document.docx');
  const outputPath = path.join(workDirectory, 'document.pdf');
  const profileDirectory = path.join(workDirectory, 'lo-profile');
  const officeBinary = process.env.LIBREOFFICE_BIN || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');

  try {
    await fs.promises.writeFile(inputPath, docxBuffer, { mode: 0o600 });

    let result;
    try {
      // Un profil LibreOffice par appel : deux conversions simultanées ne peuvent pas
      // partager le même profil, la seconde rendrait la main sans produire de PDF.
      result = await execFileAsync(officeBinary, [
        '--headless',
        `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
        '--convert-to', 'pdf',
        '--outdir', workDirectory,
        inputPath,
      ], { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    } catch (error) {
      if (error.code === 'ENOENT') {
        const unavailable = new Error('Le convertisseur Word vers PDF (LibreOffice) doit être installé sur le serveur.');
        unavailable.code = 'LIBREOFFICE_NOT_INSTALLED';
        throw unavailable;
      }
      const stderr = converterDiagnostics(error);
      if (error.killed || error.signal) {
        throw conversionFailed('La conversion Word vers PDF a été interrompue (délai dépassé ou arrêt du processus LibreOffice).', { reason: 'TIMEOUT', stderr });
      }
      throw conversionFailed('La conversion Word vers PDF a échoué (LibreOffice a renvoyé une erreur).', { reason: 'CONVERTER_ERROR', stderr });
    }

    const stderr = converterDiagnostics(result);
    let pdfBuffer;
    try {
      pdfBuffer = await fs.promises.readFile(outputPath);
    } catch (readError) {
      if (readError.code !== 'ENOENT') throw readError;
      throw conversionFailed(
        'LibreOffice n’a produit aucun PDF (module Writer ou filtres Word/PDF manquants sur le serveur ?).',
        { reason: 'NO_OUTPUT', stderr },
      );
    }

    if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw conversionFailed('LibreOffice a produit un fichier qui ne semble pas être un PDF.', { reason: 'INVALID_OUTPUT', stderr });
    }
    return pdfBuffer;
  } finally {
    const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
    const resolvedWorkDirectory = path.resolve(workDirectory);
    if (resolvedWorkDirectory.startsWith(tempRoot)) {
      await fs.promises.rm(resolvedWorkDirectory, { recursive: true, force: true });
    }
  }
}

module.exports = {
  TEMPLATES,
  TEMPLATE_TITLES,
  getTemplateParagraphs,
  validateTemplateEdits,
  convertContratsImmoDocxToPdf,
  renderContratsImmoDocx,
};
