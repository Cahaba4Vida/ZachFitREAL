const { error } = require("./response");

// Netlify Identity / GoTrue auth helper.
//
// We validate access tokens by calling Netlify's canonical endpoint:
//   GET /.netlify/identity/user   (Authorization: Bearer <token>)
//
// This avoids brittle local JWT verification and matches what the browser does.

function getTokenFromEvent(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || "";
  if (!raw) return null;

  // Accept "Bearer <token>" (case-insensitive)
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function getSiteOrigin() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "http://localhost:8888"
  );
}

async function validateWithIdentityUser(token) {
  const origin = getSiteOrigin().replace(/\/$/, "");
  const url = `${origin}/.netlify/identity/user`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) return null;

  const user = await res.json();
  return {
    id: user.id || user.sub || null,
    email: user.email || null,
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {},
    raw: user,
  };
}

async function requireUser(event, opts = {}) {
  // Fast-path: Netlify sometimes injects the user into clientContext
  const ctxUser = event?.clientContext?.user;
  if (ctxUser && (ctxUser.sub || ctxUser.email)) {
    return {
      id: ctxUser.sub || null,
      email: ctxUser.email || null,
      user_metadata: ctxUser.user_metadata || {},
      app_metadata: ctxUser.app_metadata || {},
      raw: ctxUser,
    };
  }

  const token = getTokenFromEvent(event);
  if (!token) return null;

  try {
    return await validateWithIdentityUser(token);
  } catch (e) {
    if (opts.debug) console.error("[auth] validate failed", e);
    return null;
  }
}

// Backward-compatible wrapper used by existing functions.
async function requireAuth(event) {
  const user = await requireUser(event);
  if (!user) return { user: null, authError: error(401, "Unauthorized") };
  return { user, authError: null };
}

// Admin/leader allowlist (optional).
function isAdmin(user) {
  if (!user?.email) return false;
  const allow =
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  if (!allow.length) return true; // if no allowlist configured, treat as admin
  return allow.includes(user.email.toLowerCase());
}

// Convenience wrapper if you prefer handler(event, context, user)
function requireUserOr401(handler) {
  return async (event, context) => {
    const user = await requireUser(event);
    if (!user) return error(401, "Unauthorized");
    return handler(event, context, user);
  };
}

module.exports = {
  requireUser,
  requireAuth,
  isAdmin,
  requireUserOr401,
};
