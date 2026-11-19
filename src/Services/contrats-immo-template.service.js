const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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

async function convertContratsImmoDocxToPdf(docxBuffer) {
  const workDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-immo-'));
  const inputPath = path.join(workDirectory, 'document.docx');
  const outputPath = path.join(workDirectory, 'document.pdf');
  const officeBinary = process.env.LIBREOFFICE_BIN || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');

  try {
    await fs.promises.writeFile(inputPath, docxBuffer, { mode: 0o600 });
    await execFileAsync(officeBinary, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', workDirectory,
      inputPath,
    ], { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 });

    const pdfBuffer = await fs.promises.readFile(outputPath);
    if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('LibreOffice a produit un fichier qui ne semble pas être un PDF.');
    }
    return pdfBuffer;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const unavailable = new Error('Le convertisseur Word vers PDF (LibreOffice) doit être installé sur le serveur.');
      unavailable.code = 'LIBREOFFICE_NOT_INSTALLED';
      throw unavailable;
    }
    throw error;
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
