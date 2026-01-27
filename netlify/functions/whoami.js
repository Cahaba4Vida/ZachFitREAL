const { requireAuth, isAdmin } = require("./_lib/auth");
const { getUserStore, getGlobalStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");
const { nowIso, asArray, asObject } = require("./_lib/utils");

exports.handler = withErrorHandling(async (event) => {
  let stage = "init";
  try {
  const { user, error } = await requireAuth(event, context);
  if (error) return error;
  const store = getUserStore(user.userId);
  stage = "load_profile";
  const profile = asObject(await store.get("profile"), { units: "lb" });
  const globalStore = getGlobalStore();
  stage = "load_clients";
  const clients = asArray(await globalStore.get("clients"), []);
  const nextClients = [
    {
      userId: user.userId,
      email: user.email,
      lastLogin: nowIso(),
      goal: profile.onboarding?.goal || "",
    },
    ...clients.filter((client) => client.userId !== user.userId),
  ].slice(0, 200);
  stage = "save_clients";
  await globalStore.set("clients", nextClients);
  return json(200, {
    user: {
      userId: user.userId,
      email: user.email,
      role: isAdmin(user) ? "admin" : "user",
    },
    profile,
  });
  } catch (err) {
    err.stage = stage;
    throw err;
  }
});
