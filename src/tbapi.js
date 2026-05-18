const axios = require('axios');

const TB_URL = process.env.TB_URL || 'http://localhost:8080';
const TB_USER = process.env.TB_USER || 'tenant@thingsboard.org';
const TB_PASS = process.env.TB_PASS || 'tenant';

let token = null;
let tokenExpiry = null;

async function login() {
  const res = await axios.post(`${TB_URL}/api/auth/login`, {
    username: TB_USER,
    password: TB_PASS
  });
  token = res.data.token;
  tokenExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
  return token;
}

async function getToken() {
  if (!token || Date.now() > tokenExpiry) {
    await login();
  }
  return token;
}

async function getDevices() {
  const t = await getToken();
  const res = await axios.get(`${TB_URL}/api/tenant/devices?pageSize=50&page=0`, {
    headers: { 'X-Authorization': `Bearer ${t}` }
  });
  return res.data.data;
}

async function getTelemetry(deviceId, keys, startTs, endTs) {
  const t = await getToken();
  const res = await axios.get(
    `${TB_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}&limit=100`,
    { headers: { 'X-Authorization': `Bearer ${t}` } }
  );
  return res.data;
}

async function getAlarms(startTs, endTs) {
  const t = await getToken();
  const res = await axios.get(
    `${TB_URL}/api/alarms?pageSize=50&page=0&startTime=${startTs}&endTime=${endTs}`,
    { headers: { 'X-Authorization': `Bearer ${t}` } }
  );
  return res.data.data;
}

module.exports = { getDevices, getTelemetry, getAlarms, getToken };
