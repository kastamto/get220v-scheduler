const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { generateReport } = require('./report');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendReportEmail(pdf, period) {
  if (!process.env.SMTP_USER) {
    console.log('SMTP not configured, skipping email');
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.REPORT_EMAIL || process.env.SMTP_USER,
    subject: `Get220v ${period} Report - ${new Date().toLocaleDateString('id-ID')}`,
    html: '<p>Please find attached the Get220v IoT Platform report.</p>',
    attachments: [{
      filename: `get220v-report-${period}-${Date.now()}.pdf`,
      content: pdf,
      contentType: 'application/pdf'
    }]
  });
  console.log('✅ Report email sent!');
}

function startScheduler() {
  // Daily report jam 7 pagi
  cron.schedule('0 7 * * *', async () => {
    console.log('Running daily report...');
    try {
      const { pdf } = await generateReport('daily');
      await sendReportEmail(pdf, 'daily');
    } catch (err) {
      console.error('Daily report error:', err.message);
    }
  });

  // Weekly report Senin jam 8 pagi
  cron.schedule('0 8 * * 1', async () => {
    console.log('Running weekly report...');
    try {
      const { pdf } = await generateReport('weekly');
      await sendReportEmail(pdf, 'weekly');
    } catch (err) {
      console.error('Weekly report error:', err.message);
    }
  });

  console.log('✅ Scheduler started - Daily: 07:00, Weekly: Monday 08:00');
}

module.exports = { startScheduler, generateReport, sendReportEmail };
