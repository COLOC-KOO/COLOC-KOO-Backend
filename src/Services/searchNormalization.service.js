function normalizeCitySearchTerm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(tulear|toliary)\b/g, 'toliara');
}

function hasToliaraSearchAlias(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(toliara|tulear|toliary)\b/.test(normalized);
}

module.exports = { hasToliaraSearchAlias, normalizeCitySearchTerm };
