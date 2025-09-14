#!/usr/bin/env python3
"""
Simplified Reddit + Claude integration that definitely works
"""

import requests
import pandas as pd
from datetime import datetime
import os

# Try to import anthropic, but make it optional
try:
    from anthropic import Anthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False
    print("⚠️  anthropic not available. Claude features disabled.")

class SimpleRedditClaudeAnalyzer:
    """
    Simplified Reddit scraper with optional Claude integration
    """
    
    def __init__(self, claude_api_key=None):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Initialize Claude if available
        self.claude_client = None
        if CLAUDE_AVAILABLE:
            if claude_api_key:
                self.claude_client = Anthropic(api_key=claude_api_key)
            else:
                api_key = os.getenv('ANTHROPIC_API_KEY')
                if api_key:
                    self.claude_client = Anthropic(api_key=api_key)
    
    def get_comments_only(self, thread_url, comment_limit=100):
        """Extract comments from Reddit thread"""
        print(f"Getting comments from: {thread_url}")
        
        if not thread_url.endswith('.json'):
            json_url = thread_url.rstrip('/') + '.json'
        else:
            json_url = thread_url
        
        params = {'limit': comment_limit} if comment_limit else {}
        
        try:
            response = requests.get(json_url, headers=self.headers, params=params)
            response.raise_for_status()
            data = response.json()
            comments_data = data[1]['data']['children'] if len(data) > 1 else []
            comments = self.extract_comment_text(comments_data)
            print(f"Retrieved {len(comments)} comments")
            return comments
        except Exception as e:
            print(f"Error: {e}")
            return []
    
    def extract_comment_text(self, comments_data):
        """Extract comment text recursively"""
        comment_texts = []
        for comment_item in comments_data:
            if comment_item.get('kind') != 't1':
                continue
            comment_data = comment_item.get('data', {})
            body = comment_data.get('body', '').strip()
            if body and body not in ['[deleted]', '[removed]', '']:
                comment_texts.append(body)
            replies = comment_data.get('replies')
            if replies and isinstance(replies, dict):
                nested_comments = self.extract_comment_text(replies['data']['children'])
                comment_texts.extend(nested_comments)
        return comment_texts
    
    def analyze_with_claude(self, comments, analysis_type="sentiment"):
        """Analyze comments with Claude (if available)"""
        if not self.claude_client:
            return "Claude not available. Please install anthropic package and set API key."
        
        comments_text = "\n\n".join(comments[:50])
        prompts = {
            "sentiment": "Analyze sentiment of these Reddit comments.",
            "summary": "Summarize the main topics in these comments.",
            "themes": "Identify main themes in these comments."
        }
        prompt = prompts.get(analysis_type, "Analyze these comments.")
        
        try:
            message = self.claude_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=1000,
                messages=[{"role": "user", "content": f"{prompt}\n\n{comments_text}"}]
            )
            return message.content[0].text
        except Exception as e:
            return f"Claude analysis error: {e}"
    
    def save_to_csv(self, comments, analysis=None, filename="reddit_analysis.csv"):
        """Save comments and analysis to CSV"""
        try:
            if analysis:
                df = pd.DataFrame({
                    'comment_text': comments,
                    'analysis': [analysis] * len(comments)
                })
            else:
                df = pd.DataFrame({'comment_text': comments})
            
            df.to_csv(filename, index=False)
            print(f"✅ Saved {len(comments)} comments to {filename}")
        except Exception as e:
            print(f"❌ Error saving CSV: {e}")

def main():
    """Main function"""
    print("Simple Reddit + Claude Analyzer")
    print("=" * 40)
    
    # Test URL
    url = "https://www.reddit.com/r/StockMarket/comments/1nfd9wi/new_tariff_rules_bring_maximum_chaos_as_surprise/"
    
    # Create analyzer
    analyzer = SimpleRedditClaudeAnalyzer()
    
    # Get comments
    comments = analyzer.get_comments_only(url, comment_limit=50)
    
    if not comments:
        print("No comments found!")
        return
    
    # Save comments
    analyzer.save_to_csv(comments, filename="reddit_comments_simple.csv")
    
    # Try Claude analysis if available
    if analyzer.claude_client:
        print("\n🤖 Analyzing with Claude...")
        analysis = analyzer.analyze_with_claude(comments, "sentiment")
        print(f"Analysis: {analysis[:200]}...")
        analyzer.save_to_csv(comments, analysis, "reddit_with_analysis.csv")
    else:
        print("\n⚠️  Claude not available. Comments saved without analysis.")
        print("To enable Claude analysis:")
        print("1. pip install anthropic")
        print("2. export ANTHROPIC_API_KEY='your-key'")

if __name__ == "__main__":
    main()

