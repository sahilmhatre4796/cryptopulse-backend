function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  // Postgres unique-violation -> friendly 409, never leak the raw DB error
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That value already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource does not exist' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.error('Unhandled error:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}

module.exports = { notFound, errorHandler };
