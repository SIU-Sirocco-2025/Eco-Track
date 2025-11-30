// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

const { ensurePythonDependencies } = require('../helpers/checkPythonDeps');

async function main() {
  console.log('Checking Python dependencies...\n');
  
  const result = await ensurePythonDependencies();
  
  if (result.success) {
    console.log('\n✓ All Python dependencies are ready!');
    process.exit(0);
  } else {
    console.error('\n✗ Failed to setup Python dependencies');
    console.error('Error:', result.error);
    console.error('\nPlease install manually:');
    console.error('  pip install -r requirements.txt');
    process.exit(1);
  }
}

main();