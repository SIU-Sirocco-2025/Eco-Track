// SPDX-License-Identifier: GPL-3.0-or-later
const { stat, readFile } = require('node:fs/promises');
const { verifyCaseEvidence } = require('../integrations/sirocco/case-evidence');

async function main() {
  const [file, expectedHash, ...rest] = process.argv.slice(2);
  if (!file || rest.length || (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash))) {
    throw new Error('Cách dùng: node scripts/verify-sirocco-evidence.js FILE [SHA256_TIN_CAY]');
  }
  if ((await stat(file)).size > 48 * 1024 * 1024) throw new Error('Gói vượt giới hạn kích thước.');
  const bundle = JSON.parse(await readFile(file, 'utf8'));
  const verified = verifyCaseEvidence(bundle, expectedHash);
  console.log(JSON.stringify({ ...verified, comparedWithExpectedHash: Boolean(expectedHash) }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
