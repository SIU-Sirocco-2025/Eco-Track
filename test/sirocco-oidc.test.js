// SPDX-License-Identifier: GPL-3.0-or-later
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const { createReviewRouter } = require('../integrations/sirocco/review-routes');

test('OIDC từ chối chữ ký/issuer/audience/nonce/thời hạn sai và callback dùng lại', {
  skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL, timeout: 60000,
}, async t => {
  const database = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
  assert.equal(database.pathname, '/ecotrack_oidc_tests');
  await mongoose.connect(database.href);
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const goodKey = await generateKeyPair('RS256'), wrongKey = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(goodKey.publicKey), kid: 'fixture-signing-key', use: 'sig', alg: 'RS256' };
  let mode = 'valid', nonce, tokenRequests = 0;
  const provider = express();
  const providerServer = provider.listen(0, '127.0.0.1');
  await once(providerServer, 'listening');
  const issuer = 'http://127.0.0.1:' + providerServer.address().port;
  provider.get('/.well-known/openid-configuration', (_req, res) => res.json({
    issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
    response_types_supported: ['code'], subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
  }));
  provider.get('/jwks', (_req, res) => res.json({ keys: [jwk] }));
  provider.post('/token', async (_req, res) => {
    tokenRequests++;
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({ sub: 'fixture-reviewer',
      iss: mode === 'wrong-issuer' ? issuer + '/other' : issuer,
      aud: mode === 'wrong-audience' ? 'another-client' : 'fixture-client',
      exp: mode === 'expired' ? now - 600 : now + 300, iat: now,
      nonce: mode === 'wrong-nonce' ? 'incorrect' : nonce,
      ecotrack_roles: ['ecotrack-reviewer'],
    }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(mode === 'wrong-signature' ? wrongKey.privateKey : goodKey.privateKey);
    res.json({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 300, id_token: jwt });
  });
  const app = express();
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'pug');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  app.use('/sirocco/review', createReviewRouter({
    SIROCCO_OIDC_ISSUER: issuer, SIROCCO_REVIEW_ORIGIN: origin,
    SIROCCO_OIDC_CLIENT_ID: 'fixture-client', SIROCCO_OIDC_CLIENT_SECRET: 'synthetic-client-secret-12345678901234567890',
    SIROCCO_REVIEW_SESSION_SECRET: 'synthetic-session-secret-12345678901234567890',
    CORE_API_URL: 'http://127.0.0.1:18088/api/core/connector', CORE_CONNECTOR_TOKEN: 'synthetic-connector-token-12345678901234567890',
  }));
  async function begin() {
    const response = await fetch(origin + '/sirocco/review/login', { redirect: 'manual' });
    assert.equal(response.status, 302);
    const authorization = new URL(response.headers.get('location'));
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    nonce = authorization.searchParams.get('nonce');
    return { cookie: response.headers.getSetCookie()[0].split(';')[0], state: authorization.searchParams.get('state') };
  }
  async function callback(login, state = login.state) {
    return fetch(origin + '/sirocco/review/callback?code=fixture-code&state=' + encodeURIComponent(state), {
      redirect: 'manual', headers: { Cookie: login.cookie },
    });
  }
  try {
    for (const invalid of ['wrong-signature', 'wrong-issuer', 'wrong-audience', 'wrong-nonce', 'expired']) {
      await t.test(invalid, async () => {
        mode = invalid;
        const response = await callback(await begin());
        assert.equal(response.status, 401);
      });
    }
    await t.test('state sai chặn trước token endpoint', async () => {
      const login = await begin(), before = tokenRequests;
      assert.equal((await callback(login, 'wrong-state')).status, 400);
      assert.equal(tokenRequests, before);
    });
    await t.test('phiên hợp lệ chỉ dùng callback một lần', async () => {
      mode = 'valid';
      const login = await begin();
      const accepted = await callback(login);
      assert.equal(accepted.status, 302);
      assert.equal(accepted.headers.get('location'), '/sirocco/review');
      assert.equal((await callback(login)).status, 400);
    });
  } finally {
    server.closeAllConnections(); providerServer.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => providerServer.close(resolve))]);
    await mongoose.disconnect();
  }
});
