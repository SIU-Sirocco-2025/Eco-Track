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