const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const {
  TEMPLATES,
  renderContratsImmoDocx,
} = require('../src/Services/contrats-immo-template.service');

function documentText(buffer) {
  const xml = new PizZip(buffer).file('word/document.xml').asText();
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .normalize('NFC');
}

test('les neuf modèles Word se génèrent', () => {
  for (const templateId of Object.keys(TEMPLATES)) {
    const output = renderContratsImmoDocx(templateId, {});
    assert.ok(Buffer.isBuffer(output), `${templateId} doit produire un DOCX`);
    assert.ok(output.length > 0, `${templateId} ne doit pas être vide`);
  }
});

test('Intercolocs solidaire répète les lignes de charges et les niveaux', () => {
  const output = renderContratsImmoDocx('contrat_intercolocs', {
    regime_solidaire: true,
    charges_avec: true,
    charges: [
      { charge_nom: 'Charge-Eau', charge_description: 'Eau', charge_repartition: '50%' },
      { charge_nom: 'Charge-Electricite', charge_description: 'Electricite', charge_repartition: '50%' },
    ],
    niveaux: [
      { niveau_libelle: 'Niveau-RDC', niveau_description: 'Salon' },
      { niveau_libelle: 'Niveau-R1', niveau_description: 'Chambres' },
    ],
  });
  const text = documentText(output);
  for (const marker of ['Charge-Eau', 'Charge-Electricite', 'Niveau-RDC', 'Niveau-R1']) {
    assert.ok(text.includes(marker), `${marker} doit apparaître dans le DOCX`);
  }
});

test('Propriocolocs affiche la dénomination du propriétaire société', () => {
  const output = renderContratsImmoDocx('contrat_propriocolocs', {
    bailleur_societe: true,
    bailleur_denomination: 'SOCIETE TEST',
    bailleur_representant: 'GERANT TEST',
    bailleur_representant_qualite: 'Gérant',
  });
  assert.ok(documentText(output).includes('SOCIETE TEST'));
});

test('Mandacolocs individuel sans charge se génère', () => {
  const output = renderContratsImmoDocx('contrat_mandacolocs', {
    regime_solidaire: false,
    charges_avec: false,
    charges: [],
    niveaux: [],
  });
  assert.ok(documentText(output).length > 0);
});

test('Avenant avec marge en régime solidaire affiche la valeur', () => {
  const output = renderContratsImmoDocx('avenant_substitution', {
    regime_solidaire: true,
    retribution_marge: true,
    retribution_reconduite: false,
    retribution_marge_valeur: '10%',
    sous_occupants: [{ so_nom: 'SOUS-OCCUPANT TEST', so_date_contrat: '01/01/2026' }],
  });
  const text = documentText(output);
  assert.ok(text.includes('10%'));
  assert.ok(text.includes('SOUS-OCCUPANT TEST'));
});

test('État des lieux affiche ou retire la salle de bain privée selon le choix', () => {
  const withPrivateBathroom = documentText(renderContratsImmoDocx('etat_des_lieux', { edl_sdd: true }));
  const withoutPrivateBathroom = documentText(renderContratsImmoDocx('etat_des_lieux', { edl_sdd: false }));
  assert.ok(withPrivateBathroom.includes('Salle de bain/douche'));
  assert.ok(!withoutPrivateBathroom.includes('Salle de bain/douche'));
});
