#!/bin/bash

echo "🎯 MoodRing Markets - Starting servers..."
echo "📊 Flask API server will run on http://localhost:5000"
echo "🌐 Frontend will be served on http://localhost:3000"
echo "=================================================="

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed or not in PATH"
    exit 1
fi

# Check if required packages are installed
echo "🔍 Checking dependencies..."
python3 -c "import flask, pandas" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 Installing required packages..."
    pip3 install -r requirements.txt
fi

# Start Flask server in background
echo "🚀 Starting Flask server..."
python3 flask_server.py &
FLASK_PID=$!

# Wait for Flask to start
sleep 3

# Start frontend server
echo "🌐 Starting frontend server..."
cd frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!

echo "✅ Both servers are running!"
echo "🌐 Open http://localhost:3000 in your browser"
echo "📊 API available at http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user interrupt
trap "echo '👋 Shutting down servers...'; kill $FLASK_PID $FRONTEND_PID; exit" INT
wait


