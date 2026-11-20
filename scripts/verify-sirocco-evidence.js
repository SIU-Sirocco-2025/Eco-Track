// SPDX-License-Identifier: GPL-3.0-or-later
const { stat, readFile } = require('node:fs/promises');
const { verifyCaseEvidence } = require('../integrations/sirocco/case-evidence');
const { verifyArchivedDecision, verifyDecisionHistory, historyFormat } = require('../integrations/sirocco/decision-archive');
const { createHash } = require('node:crypto');

async function main() {
  const [file, expectedHash, ...rest] = process.argv.slice(2);
  if (!file || rest.length || (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash))) {
    throw new Error('Cách dùng: node scripts/verify-sirocco-evidence.js FILE [SHA256_TIN_CAY]');
  }
  if ((await stat(file)).size > 48 * 1024 * 1024) throw new Error('Gói vượt giới hạn kích thước.');
  const bytes = await readFile(file);
  if (bytes.length > 48 * 1024 * 1024) throw new Error('Gói vượt giới hạn kích thước.');
  const evidence = JSON.parse(bytes.toString('utf8'));
  const snapshot = evidence?.schema === historyFormat;
  if (snapshot || (evidence && Object.hasOwn(evidence, 'record') && Object.hasOwn(evidence, 'bundle'))) {
    const archiveSha256 = createHash('sha256').update(bytes).digest('hex');
    if (expectedHash && archiveSha256 !== expectedHash) throw new Error('SHA-256 của gói lưu không khớp.');
    const verified = snapshot ? verifyDecisionHistory(evidence) : verifyArchivedDecision(evidence);
    console.log(JSON.stringify({ ...verified, archiveSha256,
      comparedWithExpectedHash: Boolean(expectedHash) }, null, 2));
  } else {
    console.log(JSON.stringify({ ...verifyCaseEvidence(evidence, expectedHash),
      comparedWithExpectedHash: Boolean(expectedHash) }, null, 2));
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
