const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { query } = require("./_lib/db");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso, asArray } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");
const { generateProgram } = require("./_lib/program");

const createProgram = (inputs) => {
  const weeks = generateProgram(inputs);
  return {
    id: `program_${Date.now()}`,
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    weeks,
  };
};

exports.handler = withErrorHandling(async (event) => {
  let stage = "init";
  try {
  const { user, error: authError } = await requireAuth(event);
  if (authError) return authError;
  stage = "parse_body";
  const body = parseBody(event);
  if (!body?.onboarding) return error(400, "Missing onboarding data");
  const { valid } = validateSchema("onboarding", body.onboarding);
  if (!valid) return error(400, "Invalid onboarding schema");
  stage = "generate_program";
  const program = createProgram(body.onboarding);
  const { valid: programValid } = validateSchema("program", program);
  if (!programValid) return error(400, "Program schema invalid");
  stage = "db_save_onboarding";
  await query(
    `INSERT INTO onboarding (user_id, data, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [user.userId, body.onboarding]
  );
  stage = "db_save_program";
  await query(
    `INSERT INTO programs (user_id, program, status, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET program = EXCLUDED.program, status = EXCLUDED.status, updated_at = NOW()`,
    [user.userId, program, "draft"]
  );
  const store = getUserStore(user.userId);
  stage = "load_program_revisions";
  const revisions = asArray(await store.get("programRevisions"), []);
  const nextRevisions = [program, ...revisions].slice(0, 10);
  stage = "save_program_revisions";
  await store.set("programRevisions", nextRevisions);
  return json(200, { program });
  } catch (err) {
    err.stage = stage;
    throw err;
  }
});
