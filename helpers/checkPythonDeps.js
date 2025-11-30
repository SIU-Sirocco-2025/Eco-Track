// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let depsChecked = false;
let isInstalling = false;

/**
 * Kiểm tra và cài đặt Python dependencies nếu cần
 */
async function ensurePythonDependencies() {
  // Nếu đã check hoặc đang cài, bỏ qua
  if (depsChecked || isInstalling) {
    return { success: true, message: 'Dependencies already checked' };
  }

  isInstalling = true;

  try {
    console.log('[Python] Checking dependencies...');
    
    // Kiểm tra xem có requirements.txt không
    const requirementsPath = path.join(__dirname, '../requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
      console.warn('[Python] requirements.txt not found, skipping dependency check');
      depsChecked = true;
      isInstalling = false;
      return { success: true, message: 'No requirements.txt found' };
    }

    // Thử import các thư viện cần thiết
    const checkScript = `
import sys
try:
    import torch
    import pandas
    import numpy
    import sklearn
    print("OK")
    sys.exit(0)
except ImportError as e:
    print(f"MISSING:{e}")
    sys.exit(1)
`;

    const checkResult = await runPythonScript(checkScript);
    
    if (checkResult.success && checkResult.output.includes('OK')) {
      console.log('[Python] ✓ All dependencies are installed');
      depsChecked = true;
      isInstalling = false;
      return { success: true, message: 'All dependencies installed' };
    }

    // Nếu thiếu dependencies, cài đặt
    console.log('[Python] Installing missing dependencies from requirements.txt...');
    console.log('[Python] This may take a few minutes...');
    
    const installResult = await installRequirements(requirementsPath);
    
    if (installResult.success) {
      console.log('[Python] ✓ Dependencies installed successfully');
      depsChecked = true;
    } else {
      console.error('[Python] ✗ Failed to install dependencies:', installResult.error);
    }
    
    isInstalling = false;
    return installResult;

  } catch (error) {
    isInstalling = false;
    console.error('[Python] Error checking dependencies:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Chạy Python script để kiểm tra
 */
function runPythonScript(scriptContent) {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, ['-c', scriptContent]);
    
    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output,
        error: errorOutput
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });
  });
}

/**
 * Cài đặt dependencies từ requirements.txt
 */
function installRequirements(requirementsPath) {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, ['-m', 'pip', 'install', '-r', requirementsPath]);
    
    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      const msg = data.toString();
      output += msg;
      // Hiển thị progress
      if (msg.includes('Collecting') || msg.includes('Installing')) {
        process.stdout.write('.');
      }
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      console.log(''); // New line sau khi cài xong
      resolve({
        success: code === 0,
        output: output,
        error: code !== 0 ? errorOutput : null
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });
  });
}

/**
 * Reset trạng thái check (dùng cho testing)
 */
function resetCheckStatus() {
  depsChecked = false;
  isInstalling = false;
}

module.exports = {
  ensurePythonDependencies,
  resetCheckStatus
};