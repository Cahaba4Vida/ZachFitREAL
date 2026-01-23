const { Pool } = require("pg");

let pool;

const shouldUseSsl = (connectionString) => {
  const sslMode = process.env.PGSSLMODE;
  if (sslMode && sslMode.toLowerCase() === "require") return true;
  if (!connectionString) return false;
  try {
    const url = new URL(connectionString);
    return url.searchParams.get("sslmode") === "require";
  } catch (err) {
    return false;
  }
};

const getPool = () => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      const err = new Error("Database connection not configured");
      err.statusCode = 503;
      err.reason = "DB_NOT_CONFIGURED";
      throw err;
    }
    const ssl = shouldUseSsl(connectionString)
      ? { rejectUnauthorized: false }
      : undefined;
    pool = new Pool({ connectionString, ssl });
  }
  return pool;
};

const categorizeDbError = (error) => {
  const code = error?.code;
  const message = error?.message || "";
  if (code === "28P01") {
    return { message: "Database authentication failed", statusCode: 503, reason: "DB_AUTH" };
  }
  if (code === "3D000") {
    return { message: "Database not found", statusCode: 503, reason: "DB_NOT_FOUND" };
  }
  if (code === "42P01") {
    return { message: "Database schema missing", statusCode: 500, reason: "DB_SCHEMA" };
  }
  if (code === "57P01" || code === "57P02" || code === "57P03") {
    return { message: "Database temporarily unavailable", statusCode: 503, reason: "DB_UNAVAILABLE" };
  }
  if (message.includes("timeout") || message.includes("ECONNRESET")) {
    return { message: "Database connection timed out", statusCode: 503, reason: "DB_TIMEOUT" };
  }
  if (message.includes("ENOTFOUND")) {
    return { message: "Database host not found", statusCode: 503, reason: "DB_HOST" };
  }
  return { message: "Database query failed", statusCode: 500, reason: "DB_QUERY" };
};

const query = async (text, params) => {
  try {
    const client = getPool();
    return await client.query(text, params);
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }
    const categorized = categorizeDbError(error);
    const err = new Error(categorized.message);
    err.statusCode = categorized.statusCode;
    err.reason = categorized.reason;
    err.details = { code: error?.code || null };
    throw err;
  }
};

module.exports = { getPool, query };
