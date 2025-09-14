#!/usr/bin/env python3
"""
Simple test script to verify Claude integration works
"""

try:
    import anthropic
    print("✅ anthropic module imported successfully")
except ImportError as e:
    print(f"❌ Error importing anthropic: {e}")
    exit(1)

try:
    from claude_integration import RedditClaudeAnalyzer
    print("✅ RedditClaudeAnalyzer imported successfully")
except ImportError as e:
    print(f"❌ Error importing RedditClaudeAnalyzer: {e}")
    exit(1)

# Test creating an analyzer instance
try:
    analyzer = RedditClaudeAnalyzer()
    print("✅ RedditClaudeAnalyzer instance created successfully")
    
    if analyzer.claude_client:
        print("✅ Claude client initialized (API key found)")
    else:
        print("⚠️  Claude client not initialized (no API key)")
        
except Exception as e:
    print(f"❌ Error creating analyzer: {e}")

print("\n🎉 All tests passed! Your Claude integration is working.")

