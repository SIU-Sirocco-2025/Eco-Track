// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { promisify } = require('node:util');

test('CLI kiểm đúng dịch vụ trên Core mới và vẫn chạy với Core v2 cũ', async () => {
  const root = join(__dirname, '..', 'integrations', 'sirocco');
  const manifest = require(join(root, 'manifest.json'));
  const required = ['operations.journal', 'workflow.typed.scoped', 'workflow.process.start', 'workflow.task.complete',
    'objects.read.scoped', 'objects.quarantine', 'objects.promote.verified', 'objects.scan.receipt', 'workflow.deploy.supported-bpmn'];
  const prefix = '/api/core/connector';
  const calls = [];
  let selective = true;
  let archiveSupported = false;
  let scannerUnavailable = false;
  let deployedWorkflow;
  const server = createServer(async (request, response) => {
    const path = request.url.slice(prefix.length);
    calls.push(`${request.method} ${path}`);
    response.setHeader('Content-Type', 'application/json');
    if (path === '/contract') {
      response.end(JSON.stringify({ contract: 'sirocco.connector', version: '2.0', authentication: 'server-credential',
        isolation: 'application-resources', clientId: manifest.id,
        capabilities: archiveSupported ? [...required, 'records.versions.read', 'records.versions.append'] : required,
        ...(selective ? { serviceReadiness: true } : {}) }));
    } else if (path.startsWith('/records/observation-decisions/')) {
      response.end(JSON.stringify(path.endsWith('?before=2')
        ? { items: [{ version: 1 }], next: null }
        : { items: Array.from({ length: 20 }, (_, i) => ({ version: 21 - i })), next: 2 }));
    } else if (path === '/deployments') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      deployedWorkflow = JSON.parse(Buffer.concat(chunks).toString()).xml;
      response.end(JSON.stringify({ id: 'demo-definition:1:01' }));
    } else if (path === '/ready/scanner' && scannerUnavailable) {
      response.writeHead(503);
      response.end(JSON.stringify({ error: { code: 'CONNECTOR_SERVICE_UNAVAILABLE' } }));
    } else response.end(JSON.stringify({ status: 'ready' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const env = { ...process.env, CORE_API_URL: `http://127.0.0.1:${server.address().port}${prefix}`,
    CORE_CONNECTOR_TOKEN: 'sandbox-token-'.repeat(4), SIROCCO_REVIEW_ARCHIVE: 'false' };
  const cli = async (...args) => {
    calls.length = 0;
    const { stdout } = await promisify(execFile)(process.execPath, [join(root, 'cli.js'), ...args], { env, timeout: 30000 });
    return JSON.parse(stdout);
  };
  try {
    assert.equal((await cli('check')).readiness, 'per-service');
    assert.deepEqual(calls, ['GET /contract', 'GET /ready/workflow', 'GET /ready/storage', 'GET /ready/scanner']);
    env.SIROCCO_REVIEW_ARCHIVE = 'true';
    await assert.rejects(cli('check'), error => JSON.parse(error.stderr).code === 'ARCHIVE_CAPABILITY_MISSING');
    assert.deepEqual(calls, ['GET /contract']);
    archiveSupported = true;
    assert.deepEqual((await cli('check')).services, ['workflow', 'storage', 'scanner', 'records']);
    assert.deepEqual(calls, ['GET /contract', 'GET /ready/workflow', 'GET /ready/storage', 'GET /ready/scanner', 'GET /ready/records']);
    const key = 'a'.repeat(64);
    const page = await cli('archive-history', key);
    assert.equal(page.items.length, 20);
    assert.equal(page.next, 2);
    const lastPage = await cli('archive-history', key, String(page.next));
    assert.deepEqual(lastPage.items, [{ version: 1 }]);
    assert.equal(lastPage.next, null);
    assert.deepEqual(calls, ['GET /contract', `GET /records/observation-decisions/${key}/history?before=2`]);
    await assert.rejects(cli('archive-history', key, '9007199254740993'), error => JSON.parse(error.stderr).code === 'ARCHIVE_VERSION_INVALID');
    assert.deepEqual(calls, []);
    env.SIROCCO_REVIEW_ARCHIVE = 'false';
    scannerUnavailable = true;
    await assert.rejects(cli('check'), error => {
      assert.deepEqual(JSON.parse(error.stderr), { status: 'failed', code: 'CONNECTOR_SERVICE_UNAVAILABLE', service: 'scanner' });
      return error.code === 1;
    });
    selective = false;
    assert.equal((await cli('check')).readiness, 'aggregate');
    assert.deepEqual(calls, ['GET /contract', 'GET /ready']);
    assert.equal((await cli('install-review')).definitionVariable, 'SIROCCO_REVIEW_DEFINITION_ID');
    assert.equal(deployedWorkflow, readFileSync(join(root, manifest.workflow), 'utf8'));
    assert.deepEqual(calls, ['GET /contract', 'POST /deployments']);
    assert.equal((await cli('install')).definitionVariable, 'SIROCCO_DEFINITION_ID');
    assert.equal(deployedWorkflow, readFileSync(join(root, 'source-review.bpmn20.xml'), 'utf8'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
