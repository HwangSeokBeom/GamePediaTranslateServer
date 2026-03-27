const { Pool } = require("pg");

const env = require("./env");

let pool;

function buildPool() {
  if (pool) {
    return pool;
  }

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it in the environment or .env file.");
  }

  pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });

  pool.on("error", (error) => {
    console.error("[Database] unexpected error", error.message);
  });

  return pool;
}

async function connectDatabase() {
  const database = buildPool();

  try {
    await database.query("SELECT 1");
    console.log("[Database] connected");
    return database;
  } catch (error) {
    console.error("[Database] connection failed", error.message);
    throw error;
  }
}

function getPool() {
  return buildPool();
}

async function query(statement, values = [], client) {
  const executor = client || getPool();
  return executor.query(statement, values);
}

async function getClient() {
  return getPool().connect();
}

async function pingDatabase() {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch (error) {
    console.error("[Database] health check failed", error.message);
    return false;
  }
}

async function closeDatabase() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}

module.exports = {
  connectDatabase,
  getPool,
  query,
  getClient,
  pingDatabase,
  closeDatabase,
};
