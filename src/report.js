const puppeteer = require('puppeteer');
const { getDevices, getTelemetry, getAlarms } = require('./tbapi');
const axios = require('axios');

const ML_URL = process.env.ML_URL || 'http://localhost:3003';

async function getMlInsights(deviceId, key) {
  try {
    const res = await axios.get(`${ML_URL}/ml/full/${deviceId}/${key}`, { timeout: 10000 });
    return res.data;
  } catch (e) {
    return null;
  }
}

async function generateReport(period = 'daily', options = {}) {
  const now = Date.now();
  const startTs = period === 'daily' ? now - 86400000 : period === 'weekly' ? now - 604800000 : now - 2592000000;
  const telemetryKeys = (options.telemetryKeys || ['temperature', 'humidity', 'energy']).join(',');

  console.log('Generating rich report:', period, options);

  const allDevices = await getDevices();
  const devices = options.deviceIds && options.deviceIds.length > 0
    ? allDevices.filter(d => options.deviceIds.includes(d.id.id))
    : allDevices;

  const alarms = await getAlarms(startTs, now);
  const keys = options.telemetryKeys || ['temperature', 'humidity', 'energy'];

  // Ambil telemetry + ML per device
  const deviceData = await Promise.all(devices.slice(0, 10).map(async d => {
    try {
      const telemetry = await getTelemetry(d.id.id, telemetryKeys, startTs, now);
      const ml = await getMlInsights(d.id.id, keys[0]);
      return { name: d.name, id: d.id.id, telemetry, ml };
    } catch {
      return { name: d.name, id: d.id.id, telemetry: {}, ml: null };
    }
  }));

  // Prepare chart data per device per key
  const chartDatasets = deviceData.slice(0, 5).map((d, idx) => {
    const colors = ['#6F42C1','#007BFF','#28a745','#fd7e14','#dc3545'];
    const key = keys[0];
    const points = d.telemetry[key] || [];
    return {
      name: d.name,
      color: colors[idx],
      points: points.slice(0, 24).reverse().map(p => ({
        ts: new Date(p.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}),
        value: parseFloat(p.value).toFixed(1)
      }))
    };
  });

  // Prepare hourly pattern dari ML
  const mlDevice = deviceData.find(d => d.ml?.patterns?.hourly_pattern);
  const hourlyPattern = mlDevice?.ml?.patterns?.hourly_pattern || [];

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; color: #333; padding: 24px; }
    .header { background: linear-gradient(135deg, #6F42C1, #007BFF); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; margin-bottom: 4px; }
    .header p { opacity: 0.85; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: #f8f5ff; border-radius: 8px; padding: 16px; text-align: center; border-left: 4px solid #6F42C1; }
    .stat-card h2 { font-size: 28px; color: #6F42C1; }
    .stat-card p { font-size: 12px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 15px; font-weight: 700; color: #6F42C1; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #EDE7F6; }
    .chart-container { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .chart-title { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 8px; }
    .chart-wrap { position: relative; height: 200px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #6F42C1; color: white; padding: 8px; text-align: left; }
    td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; }
    tr:nth-child(even) td { background: #fafafa; }
    .alarm-critical { color: #D32F2F; font-weight: 600; }
    .alarm-major { color: #F57C00; }
    .ml-card { background: #f8f5ff; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #6F42C1; }
    .ml-card h3 { font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px; }
    .ml-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
    .ml-stat { text-align: center; background: white; border-radius: 6px; padding: 8px; }
    .ml-stat .val { font-size: 18px; font-weight: 700; color: #6F42C1; }
    .ml-stat .lbl { font-size: 10px; color: #888; margin-top: 2px; }
    .health-bar { height: 8px; border-radius: 4px; background: #eee; margin-top: 6px; }
    .health-fill { height: 8px; border-radius: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-ok { background: #E8F5E9; color: #2E7D32; }
    .badge-warn { background: #FFF3E0; color: #E65100; }
    .badge-err { background: #FFEBEE; color: #C62828; }
    .footer { text-align: center; color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>

<div class="header">
  <h1>📊 Get220v Analytics Report</h1>
  <p>Period: ${period === 'daily' ? 'Last 24 Hours' : period === 'weekly' ? 'Last 7 Days' : 'Last 30 Days'} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('id-ID')} &nbsp;|&nbsp; Devices: ${devices.length}</p>
</div>

<div class="summary">
  <div class="stat-card">
    <h2>${devices.length}</h2>
    <p>Total Devices</p>
  </div>
  <div class="stat-card">
    <h2>${alarms.length}</h2>
    <p>Total Alarms</p>
  </div>
  <div class="stat-card" style="border-color:#D32F2F">
    <h2 style="color:#D32F2F">${alarms.filter(a => a.severity === 'CRITICAL').length}</h2>
    <p>Critical Alarms</p>
  </div>
  <div class="stat-card" style="border-color:#28a745">
    <h2 style="color:#28a745">${deviceData.filter(d => d.ml?.anomaly?.status === 'NORMAL').length}</h2>
    <p>Normal Devices</p>
  </div>
</div>

<div class="section">
  <div class="section-title">📈 Telemetry Trend — ${keys[0]}</div>
  <div class="chart-container">
    <div class="chart-title">Real-time data trend per device</div>
    <div class="chart-wrap">
      <canvas id="trendChart"></canvas>
    </div>
  </div>
</div>

${hourlyPattern.length ? `
<div class="section">
  <div class="section-title">🕐 Hourly Usage Pattern (ML Analysis)</div>
  <div class="chart-container">
    <div class="chart-title">Average ${keys[0]} per hour — learned from historical data</div>
    <div class="chart-wrap">
      <canvas id="patternChart"></canvas>
    </div>
  </div>
</div>` : ''}

<div class="section">
  <div class="section-title">🤖 ML Insights per Device</div>
  ${deviceData.map(d => {
    const ml = d.ml;
    if (!ml) return `<div class="ml-card"><h3>📱 ${d.name}</h3><p style="color:#999;font-size:12px">No ML data available</p></div>`;
    const anomaly = ml.anomaly || {};
    const predictive = ml.predictive || {};
    const health = predictive.health_score || 100;
    const healthColor = health > 70 ? '#28a745' : health > 40 ? '#fd7e14' : '#dc3545';
    const riskBadge = predictive.risk_level === 'LOW' ? 'badge-ok' : predictive.risk_level === 'MEDIUM' ? 'badge-warn' : 'badge-err';
    return `
    <div class="ml-card">
      <h3>📱 ${d.name} 
        <span class="badge ${riskBadge}" style="margin-left:8px">Risk: ${predictive.risk_level || 'N/A'}</span>
        <span class="badge ${anomaly.status === 'NORMAL' ? 'badge-ok' : 'badge-err'}" style="margin-left:4px">${anomaly.status || 'N/A'}</span>
      </h3>
      <div class="ml-grid">
        <div class="ml-stat">
          <div class="val">${anomaly.anomaly_count || 0}</div>
          <div class="lbl">Anomalies</div>
        </div>
        <div class="ml-stat">
          <div class="val">${health.toFixed(0)}%</div>
          <div class="lbl">Health Score</div>
        </div>
        <div class="ml-stat">
          <div class="val">${predictive.trend_direction || 'N/A'}</div>
          <div class="lbl">Trend</div>
        </div>
      </div>
      <div class="health-bar" style="margin-top:8px">
        <div class="health-fill" style="width:${health}%;background:${healthColor}"></div>
      </div>
      ${predictive.recommendation ? `<p style="font-size:11px;color:#555;margin-top:8px">💡 ${predictive.recommendation}</p>` : ''}
    </div>`;
  }).join('')}
</div>

${deviceData.some(d => d.ml?.predictive?.forecast?.length) ? `
<div class="section">
  <div class="section-title">🔮 Predictive Forecast (Next 12 Hours)</div>
  <div class="chart-container">
    <div class="chart-title">Predicted ${keys[0]} values based on ML model</div>
    <div class="chart-wrap">
      <canvas id="forecastChart"></canvas>
    </div>
  </div>
</div>` : ''}

<div class="section">
  <div class="section-title">📱 Device Telemetry Summary</div>
  <table>
    <tr><th>Device</th>${keys.map(k => `<th>${k}</th>`).join('')}<th>Anomalies</th><th>Health</th></tr>
    ${deviceData.map(d => `
      <tr>
        <td><b>${d.name}</b></td>
        ${keys.map(k => `<td>${d.telemetry[k]?.[0]?.value ?? '-'}</td>`).join('')}
        <td>${d.ml?.anomaly?.anomaly_count ?? '-'}</td>
        <td>${d.ml?.predictive?.health_score ? d.ml.predictive.health_score.toFixed(0)+'%' : '-'}</td>
      </tr>`).join('')}
  </table>
</div>

<div class="section">
  <div class="section-title">🚨 Alarm Summary</div>
  <table>
    <tr><th>Type</th><th>Device</th><th>Severity</th><th>Status</th><th>Time</th></tr>
    ${alarms.length > 0 ? alarms.map(a => `
      <tr>
        <td>${a.type}</td>
        <td>${a.originatorName}</td>
        <td class="${a.severity === 'CRITICAL' ? 'alarm-critical' : 'alarm-major'}">${a.severity}</td>
        <td>${a.status}</td>
        <td>${new Date(a.createdTime).toLocaleString('id-ID')}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">No alarms in this period</td></tr>'}
  </table>
</div>

<div class="footer">
  <p>Get220v IoT Platform | Automated Analytics Report | ${new Date().toLocaleString('id-ID')}</p>
</div>

<script>
// Trend Chart
const trendCtx = document.getElementById('trendChart').getContext('2d');
const chartDatasets = ${JSON.stringify(chartDatasets)};
const allLabels = [...new Set(chartDatasets.flatMap(d => d.points.map(p => p.ts)))];
new Chart(trendCtx, {
  type: 'line',
  data: {
    labels: allLabels,
    datasets: chartDatasets.map(d => ({
      label: d.name,
      data: allLabels.map(ts => {
        const pt = d.points.find(p => p.ts === ts);
        return pt ? pt.value : null;
      }),
      borderColor: d.color,
      backgroundColor: d.color + '20',
      tension: 0.4,
      fill: false,
      pointRadius: 2,
      spanGaps: true
    }))
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: false } }
  }
});

// Pattern Chart
${hourlyPattern.length ? `
const patternCtx = document.getElementById('patternChart').getContext('2d');
const hourlyData = ${JSON.stringify(hourlyPattern)};
new Chart(patternCtx, {
  type: 'bar',
  data: {
    labels: hourlyData.map(h => h.hour + ':00'),
    datasets: [{
      label: 'Avg ${keys[0]}',
      data: hourlyData.map(h => h.avg_value.toFixed(2)),
      backgroundColor: '#6F42C180',
      borderColor: '#6F42C1',
      borderWidth: 1
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  }
});` : ''}

// Forecast Chart
${deviceData.some(d => d.ml?.predictive?.forecast?.length) ? `
const forecastCtx = document.getElementById('forecastChart').getContext('2d');
const forecastDevice = ${JSON.stringify(deviceData.find(d => d.ml?.predictive?.forecast?.length))};
const forecast = forecastDevice?.ml?.predictive?.forecast || [];
new Chart(forecastCtx, {
  type: 'line',
  data: {
    labels: forecast.map(f => new Date(f.ts).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})),
    datasets: [{
      label: 'Predicted ' + '${keys[0]}',
      data: forecast.map(f => f.predicted_value.toFixed(2)),
      borderColor: '#007BFF',
      backgroundColor: '#007BFF20',
      tension: 0.4,
      fill: true,
      borderDash: [5,5]
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } }
  }
});` : ''}
</script>
</body>
</html>`;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Tunggu chart render
  await new Promise(r => setTimeout(r, 2000));
  
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' }
  });
  await browser.close();

  console.log('✅ Rich PDF generated:', pdf.length, 'bytes');
  return { pdf, html };
}

module.exports = { generateReport };
