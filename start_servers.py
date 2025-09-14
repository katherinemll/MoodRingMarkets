#!/usr/bin/env python3
"""
Startup script to run both Flask backend and serve frontend
"""
import subprocess
import sys
import os
import time
import threading
import webbrowser
from pathlib import Path

def run_flask_server():
    """Run the Flask server"""
    print("🚀 Starting Flask server...")
    subprocess.run([sys.executable, "flask_server.py"])

def run_frontend_server():
    """Run a simple HTTP server for the frontend"""
    print("🌐 Starting frontend server...")
    os.chdir("frontend")
    subprocess.run([sys.executable, "-m", "http.server", "3000"])

def main():
    print("🎯 MoodRing Markets - Starting both servers...")
    print("📊 Flask API server will run on http://localhost:5000")
    print("🌐 Frontend will be served on http://localhost:3000")
    print("=" * 50)
    
    # Start Flask server in a separate thread
    flask_thread = threading.Thread(target=run_flask_server, daemon=True)
    flask_thread.start()
    
    # Wait a moment for Flask to start
    time.sleep(2)
    
    # Start frontend server
    try:
        run_frontend_server()
    except KeyboardInterrupt:
        print("\n👋 Shutting down servers...")
        sys.exit(0)

if __name__ == "__main__":
    main()


