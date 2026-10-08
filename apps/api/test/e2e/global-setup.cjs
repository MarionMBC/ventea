/*
 * Recrea la base de e2e y le aplica las migraciones reales (`prisma migrate deploy`):
 * los tests corren contra el mismo esquema que producción, no contra tablas
 * armadas a mano.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const { Client } = require('pg');

const { E2E_DATABASE_URL } = require('./env.cjs');

module.exports = async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(database)) {
    throw new Error(
      `La base de e2e debe llamarse *_test (se borra en cada corrida): "${database}"`,
    );
  }

  const admin = new URL(E2E_DATABASE_URL);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });
};
