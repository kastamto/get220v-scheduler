const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'thingsboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres'
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduler_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        cron_expression TEXT NOT NULL,
        report_type TEXT DEFAULT 'daily',
        device_ids TEXT[],
        telemetry_keys TEXT[],
        email_recipients TEXT[],
        smtp_host TEXT,
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT,
        smtp_pass TEXT,
        smtp_from TEXT,
        enabled BOOLEAN DEFAULT true,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Scheduler jobs table ready');
  } finally {
    client.release();
  }
}

async function createJob(job) {
  const result = await pool.query(
    `INSERT INTO scheduler_jobs 
     (tenant_id, name, description, cron_expression, report_type, device_ids, 
      telemetry_keys, email_recipients, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [job.tenantId, job.name, job.description, job.cronExpression, job.reportType,
     job.deviceIds, job.telemetryKeys, job.emailRecipients, job.smtpHost,
     job.smtpPort, job.smtpUser, job.smtpPass, job.smtpFrom, job.enabled !== false]
  );
  return result.rows[0];
}

async function getJobs(tenantId) {
  const result = await pool.query(
    'SELECT * FROM scheduler_jobs WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
}

async function getJob(id) {
  const result = await pool.query('SELECT * FROM scheduler_jobs WHERE id = $1', [id]);
  return result.rows[0];
}

async function updateJob(id, job) {
  const result = await pool.query(
    `UPDATE scheduler_jobs SET 
     name=$1, description=$2, cron_expression=$3, report_type=$4,
     device_ids=$5, telemetry_keys=$6, email_recipients=$7,
     smtp_host=$8, smtp_port=$9, smtp_user=$10, smtp_pass=$11, smtp_from=$12,
     enabled=$13, updated_at=NOW()
     WHERE id=$14 RETURNING *`,
    [job.name, job.description, job.cronExpression, job.reportType,
     job.deviceIds, job.telemetryKeys, job.emailRecipients,
     job.smtpHost, job.smtpPort, job.smtpUser, job.smtpPass, job.smtpFrom,
     job.enabled, id]
  );
  return result.rows[0];
}

async function deleteJob(id) {
  await pool.query('DELETE FROM scheduler_jobs WHERE id = $1', [id]);
}

async function updateLastRun(id) {
  await pool.query(
    'UPDATE scheduler_jobs SET last_run = NOW(), updated_at = NOW() WHERE id = $1',
    [id]
  );
}

async function getAllEnabledJobs() {
  const result = await pool.query('SELECT * FROM scheduler_jobs WHERE enabled = true');
  return result.rows;
}

module.exports = { initDb, createJob, getJobs, getJob, updateJob, deleteJob, updateLastRun, getAllEnabledJobs };
