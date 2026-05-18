const puppeteer = require('puppeteer');
const { getDevices, getTelemetry, getAlarms } = require('./tbapi');

async function generateReport(period = 'daily', options = {}) {
  const now = Date.now();
  const startTs = period === 'daily' ? now - 86400000 : now - 604800000;
  const telemetryKeys = (options.telemetryKeys || ['temperature', 'humidity', 'energy']).join(',');

  console.log('Generating report:', period, options);

  const allDevices = await getDevices();
  const devices = options.deviceIds && options.deviceIds.length > 0
    ? allDevices.filter(d => options.deviceIds.includes(d.id.id))
    : allDevices;

  const alarms = await getAlarms(startTs, now);

  const deviceData = await Promise.all(devices.slice(0, 20).map(async d => {
    try {
      const telemetry = await getTelemetry(d.id.id, telemetryKeys, startTs, now);
      return { name: d.name, id: d.id.id, telemetry };
    } catch {
      return { name: d.name, id: d.id.id, telemetry: {} };
    }
  }));

  const keys = (options.telemetryKeys || ['temperature', 'humidity', 'energy']);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #6F42C1; border-bottom: 3px solid #6F42C1; padding-bottom: 10px; }
    h2 { color: #007BFF; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #6F42C1; color: white; padding: 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .card { background: #f0ebff; border-radius: 8px; padding: 20px; flex: 1; text-align: center; }
    .card h3 { margin: 0; font-size: 32px; color: #6F42C1; }
    .card p { margin: 5px 0 0; color: #666; }
    .alarm-critical { color: #D32F2F; font-weight: bold; }
    .alarm-major { color: #F57C00; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>📊 Get220v IoT Platform Report</h1>
  <p><b>Period:</b> ${period === 'daily' ? 'Last 24 Hours' : 'Last 7 Days'} | <b>Generated:</b> ${new Date().toLocaleString('id-ID')}</p>

  <div class="summary">
    <div class="card"><h3>${devices.length}</h3><p>Devices</p></div>
    <div class="card"><h3>${alarms.length}</h3><p>Total Alarms</p></div>
    <div class="card"><h3>${alarms.filter(a => a.severity === 'CRITICAL').length}</h3><p>Critical</p></div>
  </div>

  <h2>📱 Device Telemetry</h2>
  <table>
    <tr><th>Device</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>
    ${deviceData.map(d => `
      <tr>
        <td><b>${d.name}</b></td>
        ${keys.map(k => `<td>${d.telemetry[k]?.[0]?.value ?? '-'}</td>`).join('')}
      </tr>
    `).join('')}
  </table>

  <h2>🚨 Alarms</h2>
  <table>
    <tr><th>Type</th><th>Device</th><th>Severity</th><th>Status</th><th>Time</th></tr>
    ${alarms.length > 0 ? alarms.map(a => `
      <tr>
        <td>${a.type}</td>
        <td>${a.originatorName}</td>
        <td class="${a.severity === 'CRITICAL' ? 'alarm-critical' : 'alarm-major'}">${a.severity}</td>
        <td>${a.status}</td>
        <td>${new Date(a.createdTime).toLocaleString('id-ID')}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">No alarms</td></tr>'}
  </table>

  <div class="footer">
    <p>Get220v IoT Platform | get220v.com | Automated Report</p>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
  await browser.close();

  console.log('✅ PDF generated:', pdf.length, 'bytes');
  return { pdf, html };
}

module.exports = { generateReport };
