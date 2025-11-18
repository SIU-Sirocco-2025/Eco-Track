const { spawn } = require('child_process');
const path = require('path');

/**
 * Chạy Python script và trả về kết quả
 * @param {string} scriptPath - Đường dẫn script Python
 * @param {Array} args - Các tham số dòng lệnh
 * @returns {Promise<object>} - Kết quả từ Python
 */
module.exports.runPythonScript = (scriptPath, args = []) => {
  return new Promise((resolve, reject) => {
    // Sử dụng python3 hoặc python tùy hệ thống
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    const pythonProcess = spawn(pythonCmd, [scriptPath, ...args]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script failed: ${stderr || stdout}`));
      }
      
      try {
        // Parse JSON output từ Python
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python: ${error.message}`));
    });
  });
};

/**
 * Chạy Python script với CSV từ stdin và nhận JSON từ stdout
 * @param {string} scriptPath - Đường dẫn script Python
 * @param {Array} args - Tham số dòng lệnh
 * @param {string} csvData - Dữ liệu CSV để gửi qua stdin
 * @returns {Promise<object>} - Kết quả JSON từ Python
 */
module.exports.runPythonScriptWithStdin = (scriptPath, args = [], csvData = '') => {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    const pythonProcess = spawn(pythonCmd, [scriptPath, ...args]);
    
    let stdout = '';
    let stderr = '';
    
    // Gửi CSV qua stdin
    if (csvData) {
      pythonProcess.stdin.write(csvData);
      pythonProcess.stdin.end();
    }
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python failed: ${stderr || stdout}`));
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python: ${error.message}`));
    });
  });
};