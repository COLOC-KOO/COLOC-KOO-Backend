function notFound(req, res) {
  res.status(404).json({ message: 'Route introuvable.' });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Erreur serveur.',
  });
}

module.exports = { notFound, errorHandler };
