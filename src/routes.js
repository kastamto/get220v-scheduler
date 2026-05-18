const express = require('express');
const router = express.Router();
const { createJob, getJobs, getJob, updateJob, deleteJob } = require('./db');
const { runJob } = require('./runner');

router.get('/jobs', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const jobs = await getJobs(tenantId);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const job = await createJob({ ...req.body, tenantId });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/jobs/:id', async (req, res) => {
  try {
    const job = await updateJob(req.params.id, req.body);
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    await deleteJob(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/run', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await runJob(job);
    res.json({ success: true, message: 'Job executed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
