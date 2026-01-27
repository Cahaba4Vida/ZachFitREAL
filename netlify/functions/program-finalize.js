const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { nowIso, asArray } = require("./_lib/utils");
const db = require("./_lib/db");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event, context) => {
  let stage = "init";
  try {
  const { user, error: authError } = await requireAuth(event, context);
  if (authError) return authError;
  stage = "db_load_program";
  const result = await db.query(
    `SELECT program
     FROM programs
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [user.userId]
  );
  const program = result.rows[0]?.program;
  if (!program) return error(404, "Program not found");
  const finalized = { ...program, status: "finalized", updatedAt: nowIso() };
  const { valid } = validateSchema("program", finalized);
  if (!valid) return error(400, "Program schema invalid");
  stage = "db_finalize_program";
  await db.query(
    `UPDATE programs
     SET program = $1, status = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [finalized, "final", user.userId]
  );
  const store = getUserStore(user.userId);
  stage = "load_program_revisions";
  const revisions = asArray(await store.get("programRevisions"), []);
  const nextRevisions = [finalized, ...revisions].slice(0, 10);
  stage = "save_program_revisions";
  await store.set("programRevisions", nextRevisions);
  return json(200, finalized);
  } catch (err) {
    err.stage = stage;
    throw err;
  }
});
