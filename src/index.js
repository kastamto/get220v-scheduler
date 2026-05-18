const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { initDb, getAllEnabledJobs } = require('./db');
const { runJob } = require('./runner');
const { generateReport } = require('./report');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Download report langsung
app.get('/report/:period', async (req, res) => {
  try {
    const useAi = req.query.ai !== 'false';
    const { pdf } = await generateReport(req.params.period, {}, useAi);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=get220v-${req.params.period}-report.pdf`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Forward report ke Telegram via scheduler (avoid CORS)
app.post('/report/telegram', async (req, res) => {
  try {
    const { period, useAi } = req.body;
    const chatApiUrl = process.env.CHAT_API_URL || 'http://localhost:3001';
    const response = await require('axios').post(`${chatApiUrl}/api/telegram/report`, {
      period: period || 'daily'
    });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'Get220v Scheduler running' }));

// Dynamic scheduler - cek setiap menit
const activeJobs = new Map();

async function reloadJobs() {
  // Stop semua job yang ada
  activeJobs.forEach(job => job.stop());
  activeJobs.clear();

  // Load semua enabled jobs dari DB
  const jobs = await getAllEnabledJobs();
  jobs.forEach(job => {
    if (cron.validate(job.cron_expression)) {
      const cronJob = cron.schedule(job.cron_expression, () => runJob(job));
      activeJobs.set(job.id, cronJob);
      console.log(`✅ Scheduled: ${job.name} (${job.cron_expression})`);
    }
  });
  console.log(`Loaded ${jobs.length} scheduled jobs`);
}

const PORT = process.env.PORT || 3002;

initDb().then(async () => {
  await reloadJobs();
  
  // Reload jobs setiap 5 menit
  cron.schedule('*/5 * * * *', reloadJobs);

  app.listen(PORT, () => {
    console.log(`Get220v Scheduler running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});
