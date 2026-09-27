import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]];
  }));
}

const env = {
  ...readEnvFile(path.join(root, '.env.supabase.local')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};
const connectionString = fs.existsSync(path.join(root, 'supabase/.temp/pooler-url'))
  ? fs.readFileSync(path.join(root, 'supabase/.temp/pooler-url'), 'utf8').trim()
  : env.SUPABASE_DB_URL;
if (!connectionString || !env.SUPABASE_DB_PASSWORD || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Gerekli Supabase bağlantı bilgileri bulunamadı. .env.supabase.local ve .env.local dosyalarını kontrol edin.');
}

const endpoint = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/cleanup-field-update-photos`;
const command = `select net.http_post(url := '${endpoint}', headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '${env.VITE_SUPABASE_ANON_KEY}', 'Authorization', 'Bearer ${env.VITE_SUPABASE_ANON_KEY}'), body := '{}'::jsonb, timeout_milliseconds := 30000);`;
const jobName = 'cleanup-field-update-photos-daily';
const schedule = '17 * * * *'; // Hourly cleanup bounds interrupted upload retention.
const url = new URL(connectionString);
url.password = env.SUPABASE_DB_PASSWORD;
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

await client.connect();
try {
  const { rows } = await client.query('select jobid, schedule, command, active from cron.job where jobname = $1 order by jobid', [jobName]);
  const current = rows[0];
  const commandIsCurrent = current?.command?.includes(endpoint) && current.command.includes('net.http_post') && current.command.includes(env.VITE_SUPABASE_ANON_KEY) && current.command.includes('Authorization') && current.command.includes('Bearer');
  if (rows.length === 1 && current?.active && current.schedule === schedule && commandIsCurrent) {
    console.log('Fotoğraf yaşam döngüsü temizleme işi zaten saatlik ve aktif; değişiklik yapılmadı.');
  } else {
    await client.query('begin');
    try {
      for (const job of rows) await client.query('select cron.unschedule($1::bigint)', [job.jobid]);
      await client.query('select cron.schedule($1, $2, $3)', [jobName, schedule, command]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    const { rows: verified } = await client.query('select schedule, active, command from cron.job where jobname = $1', [jobName]);
    if (verified.length !== 1 || !verified[0].active || verified[0].schedule !== schedule || !verified[0].command.includes('Authorization')) {
      throw new Error('Cron işi oluşturuldu ancak doğrulama beklenen tek ve aktif 08.30 ayarını teyit edemedi.');
    }
    console.log('Fotoğraf yaşam döngüsü temizleme işi doğrulandı: tek aktif saatlik cron.');
  }
} finally {
  await client.end();
}
