#!/usr/bin/env bash
# Build script for Render deployment

set -o errexit

echo "=========================================="
echo "Installing Node.js dependencies..."
echo "=========================================="
npm install

echo ""
echo "=========================================="
echo "Installing Python dependencies..."
echo "=========================================="

# Kiểm tra Python có sẵn không
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
    PIP_CMD=pip3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
    PIP_CMD=pip
else
    echo "ERROR: Python not found!"
    exit 1
fi

echo "Using Python: $($PYTHON_CMD --version)"

# Cài đặt Python dependencies
$PIP_CMD install --upgrade pip
$PIP_CMD install -r requirements.txt

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "=========================================="
