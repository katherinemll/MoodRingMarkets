#!/usr/bin/env python3
"""
Check which Python interpreter the IDE is using
"""

import sys
import os

print("IDE Python Interpreter Check")
print("=" * 40)
print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Python path: {sys.path[0]}")

# Check if yfinance is available
try:
    import yfinance
    print("✅ yfinance is available")
except ImportError as e:
    print(f"❌ yfinance not available: {e}")
    print(f"Install with: {sys.executable} -m pip install yfinance")

print(f"\nCurrent working directory: {os.getcwd()}")
print("\nTo fix the issue:")
print("1. Copy the Python executable path above")
print("2. In Cursor: Cmd+Shift+P → 'Python: Select Interpreter'")
print("3. Choose the path shown above")

