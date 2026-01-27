const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");
const { asObject } = require("./_lib/utils");

exports.handler = withErrorHandling(async (event, context) => {
  const { user, error } = await requireAuth(event, context);
  if (error) return error;
  const store = getUserStore(user.userId);
  const profile = asObject(await store.get("profile"), { units: "lb" });
  return json(200, profile);
});