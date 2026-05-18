const nodemailer = require('nodemailer');
const axios = require('axios');
const FormData = require('form-data');
const { generateReport } = require('./report');
const { updateLastRun } = require('./db');

const CHAT_API = process.env.CHAT_API_URL || 'http://localhost:3001';

async function sendTelegram(pdf, filename, caption, chatId) {
  try {
    const form = new FormData();
    form.append('chat_id', chatId || '');
    form.append('period', 'daily');

    await axios.post(`${CHAT_API}/api/telegram/report`, { period: 'daily' });
    console.log('✅ Telegram report sent');
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}

async function runJob(job) {
  console.log(`Running job: ${job.name}`);

  try {
    const { pdf } = await generateReport(job.report_type, {
      deviceIds: job.device_ids,
      telemetryKeys: job.telemetry_keys || ['temperature', 'humidity', 'energy']
    });

    // Kirim via Email
    if (job.email_recipients && job.email_recipients.length > 0 && job.smtp_host) {
      const isSSL = job.smtp_port === 465;
      const transporter = nodemailer.createTransport({
        host: job.smtp_host,
        port: job.smtp_port || 587,
        secure: isSSL,
        tls: { rejectUnauthorized: false },
        auth: { user: job.smtp_user, pass: job.smtp_pass }
      });

      await transporter.verify();
      await transporter.sendMail({
        from: job.smtp_from || job.smtp_user,
        to: job.email_recipients.join(','),
        subject: `Get220v Report - ${job.name} - ${new Date().toLocaleDateString('id-ID')}`,
        html: `<p>Please find attached the scheduled report: <b>${job.name}</b></p>
               <p>Generated: ${new Date().toLocaleString('id-ID')}</p>`,
        attachments: [{
          filename: `get220v-${job.name}-${Date.now()}.pdf`,
          content: pdf,
          contentType: 'application/pdf'
        }]
      });
      console.log(`✅ Email sent to: ${job.email_recipients.join(', ')}`);
    }

    // Kirim via Telegram jika ada telegram_chat_id
    if (job.telegram_chat_id) {
      await axios.post(`${CHAT_API}/api/telegram/report`, {
        chatId: job.telegram_chat_id,
        period: job.report_type
      });
      console.log('✅ Telegram report sent');
    }

    await updateLastRun(job.id);
    console.log(`✅ Job completed: ${job.name}`);
  } catch (err) {
    console.error(`❌ Job failed: ${job.name}`, err.message);
    throw err;
  }
}

module.exports = { runJob };
