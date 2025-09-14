#!/usr/bin/env python3
"""
Setup script for Reddit + Claude integration
"""

import os
import subprocess
import sys

def install_requirements():
    """Install required packages"""
    print("Installing required packages...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Packages installed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing packages: {e}")
        return False

def setup_api_key():
    """Guide user through API key setup"""
    print("\n" + "="*50)
    print("Claude API Key Setup")
    print("="*50)
    print("1. Go to: https://console.anthropic.com/")
    print("2. Sign up or log in")
    print("3. Create an API key")
    print("4. Copy the key")
    
    api_key = input("\nEnter your Claude API key (or press Enter to skip): ").strip()
    
    if api_key:
        # Save to environment file
        with open('.env', 'w') as f:
            f.write(f"ANTHROPIC_API_KEY={api_key}\n")
        print("✅ API key saved to .env file")
        
        # Also set for current session
        os.environ['ANTHROPIC_API_KEY'] = api_key
        print("✅ API key set for current session")
        return True
    else:
        print("⚠️  Skipped API key setup. You can set it later with:")
        print("   export ANTHROPIC_API_KEY='your-key-here'")
        return False

def test_connection():
    """Test the Claude connection"""
    print("\n" + "="*50)
    print("Testing Claude Connection")
    print("="*50)
    
    try:
        from claude_integration import RedditClaudeAnalyzer
        
        analyzer = RedditClaudeAnalyzer()
        
        if analyzer.claude_client:
            print("✅ Claude client initialized successfully!")
            
            # Test with a simple analysis
            test_comments = ["This is a test comment", "Another test comment"]
            result = analyzer.analyze_comments_with_claude(test_comments, "sentiment")
            print("✅ Claude analysis test successful!")
            print(f"Sample result: {result[:100]}...")
            return True
        else:
            print("❌ Claude client not initialized. Check your API key.")
            return False
            
    except Exception as e:
        print(f"❌ Error testing connection: {e}")
        return False

def main():
    """Main setup function"""
    print("Reddit + Claude Integration Setup")
    print("="*40)
    
    # Step 1: Install packages
    if not install_requirements():
        return
    
    # Step 2: Setup API key
    api_key_set = setup_api_key()
    
    # Step 3: Test connection
    if api_key_set:
        test_connection()
    
    print("\n" + "="*50)
    print("Setup Complete!")
    print("="*50)
    print("You can now run:")
    print("  python claude_integration.py")
    print("\nOr use the analyzer in your own code:")
    print("  from claude_integration import RedditClaudeAnalyzer")
    print("  analyzer = RedditClaudeAnalyzer()")

if __name__ == "__main__":
    main()
