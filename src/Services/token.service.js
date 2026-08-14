const jwt = require('jsonwebtoken');

// ✅ sessionId optionnel : lie le token a une session (appareil connecte)
function signToken(user, sessionId) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  if (sessionId) {
    payload.session_id = sessionId;
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'dev_secret_change_me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { signToken };
