#!/usr/bin/env bash
# Build script for Render deployment

set -o errexit

echo "=========================================="
echo "Installing Node.js dependencies..."
echo "=========================================="
npm install

echo ""
echo "=========================================="
echo "Setting up Python virtual environment..."
echo "=========================================="

# Kiểm tra Python có sẵn không
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "ERROR: Python not found!"
    exit 1
fi

echo "Using Python: $($PYTHON_CMD --version)"

# Tạo virtual environment nếu chưa có
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Activate virtual environment và cài packages
echo "Installing Python packages in virtual environment..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "Virtual environment: venv/"
echo "=========================================="
