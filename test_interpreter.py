#!/usr/bin/env python3
"""
Test script to verify Python interpreter and packages
"""

import sys
import os

print("Python Interpreter Test")
print("=" * 30)
print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Python path: {sys.path[0]}")

print("\nTesting package imports...")

# Test basic packages
try:
    import requests
    print("✅ requests - OK")
except ImportError as e:
    print(f"❌ requests - FAILED: {e}")

try:
    import pandas
    print("✅ pandas - OK")
except ImportError as e:
    print(f"❌ pandas - FAILED: {e}")

try:
    import anthropic
    print("✅ anthropic - OK")
except ImportError as e:
    print(f"❌ anthropic - FAILED: {e}")

print(f"\nCurrent working directory: {os.getcwd()}")
print("✅ Test complete!")

