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

/**
 * Fill one supplied Word template.
 *
 * paragraphLoop removes paragraphs containing only a block opener/closer;
 * normal and inverted sections handle conditional content; loops placed in a
 * Word table row duplicate that row for each item in the supplied array.
 */
function renderContratsImmoDocx(templateId, data) {
  const filename = TEMPLATES[templateId];
  if (!filename) throw new Error(`Modèle Contrats Immo inconnu : ${templateId}`);

  const templatePath = path.join(TEMPLATE_DIRECTORY, filename);
  const content = fs.readFileSync(templatePath);
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
  convertContratsImmoDocxToPdf,
  renderContratsImmoDocx,
};
