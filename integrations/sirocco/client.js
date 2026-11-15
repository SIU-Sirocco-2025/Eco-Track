// SPDX-License-Identifier: GPL-3.0-or-later
const manifest = require('./manifest.json');
class ConnectorError extends Error {
  constructor(code, status, retryable = false) { super(code); this.code = code; this.status = status; this.retryable = retryable; }
}
class Connector {
  constructor({ url, token, clientId = manifest.id, deploy = false, timeout = 45000 }) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new ConnectorError('CONNECTOR_CONFIGURATION'); }
    if ((!['https:'].includes(parsed.protocol) && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) ||
        parsed.pathname !== '/api/core/connector' || parsed.username || parsed.password || parsed.search || parsed.hash ||
        typeof token !== 'string' || token.length < 32 || token.length > 512 || !/^[a-z][a-z0-9_-]{0,39}$/.test(clientId) ||
        !Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new ConnectorError('CONNECTOR_CONFIGURATION');
    Object.assign(this, { url, token, clientId, deploy, timeout });
  }
  async send(path, body, headers = {}, binary = false) {
    if (!['/contract', '/ready', '/workflow', '/deployments', '/objects', '/objects/promote', '/objects/receipt'].includes(path) &&
        !/^\/operations\/[a-zA-Z0-9_-]{16,100}$/.test(path)) throw new ConnectorError('CONNECTOR_PATH_INVALID');
    const signal = AbortSignal.timeout(this.timeout);
    try {
      const result = await fetch(this.url + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal,
        headers: { ...headers, Authorization: `Bearer ${this.token}`, 'X-Core-Contract-Version': '2.0',
          ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }) },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
      if (!result.ok) {
        let code = `CONNECTOR_HTTP_${result.status}`;
        try { const data = await result.json(); if (/^[A-Z][A-Z0-9_]{0,79}$/.test(data.error?.code)) code = data.error.code; } catch {}
        throw new ConnectorError(code, result.status, result.status === 429 || result.status >= 500);
      }
      return binary ? Buffer.from(await result.arrayBuffer()) : await result.json();
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(signal.aborted ? 'CONNECTOR_TIMEOUT' : 'CONNECTOR_UNAVAILABLE', undefined, true);
    }
  }
  async negotiate() {
    const c = await this.send('/contract');
    const required = ['operations.journal', 'workflow.typed.scoped', 'workflow.process.start', 'workflow.task.complete',
      'objects.read.scoped', 'objects.quarantine', 'objects.promote.verified', 'objects.scan.receipt',
      ...(this.deploy ? ['workflow.deploy.supported-bpmn'] : [])];
    if (c.contract !== 'sirocco.connector' || c.version !== '2.0' || c.authentication !== 'server-credential' ||
        c.isolation !== 'application-resources') throw new ConnectorError('CONNECTOR_CONTRACT_INCOMPATIBLE');
    if (c.clientId !== this.clientId) throw new ConnectorError('CONNECTOR_CLIENT_MISMATCH');
    if (!Array.isArray(c.capabilities) || required.some(r => !c.capabilities.includes(r))) throw new ConnectorError('CONNECTOR_CAPABILITY_MISSING');
    this.connected = true;
    return c;
  }
  async request(path, body, headers, binary) {
    if (!this.connected) await this.negotiate();
    return this.send(path, body, headers, binary);
  }
  async workflow(body, operationId) {
    return (await this.request('/workflow', body, operationId ? { 'X-Core-Operation-Id': operationId } : {})).data;
  }
}
module.exports = { Connector, ConnectorError };
