#!/usr/bin/env bash
# Java Step Debugger Startup Script
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "☕ Checking Java environment..."
if ! command -v javac &> /dev/null; then
    echo "❌ javac could not be found. Please ensure JDK 21+ is installed."
    exit 1
fi

echo "☕ Compiling Tracer engine..."
javac -d backend backend/Tracer.java

echo "🚀 Starting Java Step Debugger server..."
echo "🌐 Open your browser at: http://localhost:3000"
echo "--------------------------------------------------"
python3 backend/server.py
