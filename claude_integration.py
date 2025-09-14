import requests
import pandas as pd
from datetime import datetime
import json
import os
from anthropic import Anthropic

class RedditClaudeAnalyzer:
    """
    Reddit scraper integrated with Claude AI for comment analysis
    """
    
    def __init__(self, claude_api_key=None):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Initialize Claude client
        if claude_api_key:
            self.claude_client = Anthropic(api_key=claude_api_key)
        else:
            # Try to get from environment variable
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if api_key:
                self.claude_client = Anthropic(api_key=api_key)
            else:
                print("Warning: No Claude API key provided. Set ANTHROPIC_API_KEY environment variable or pass api_key parameter.")
                self.claude_client = None
    
    def get_comments_only(self, thread_url, comment_limit=100):
        """
        Extract only comment content from a Reddit thread
        """
        print(f"Getting comments from: {thread_url}")
        
        # Convert to JSON URL
        if not thread_url.endswith('.json'):
            json_url = thread_url.rstrip('/') + '.json'
        else:
            json_url = thread_url
        
        params = {'limit': comment_limit} if comment_limit else {}
        
        try:
            response = requests.get(json_url, headers=self.headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            
            # Get comments data (second element in array)
            comments_data = data[1]['data']['children'] if len(data) > 1 else []
            
            # Extract just the comment text
            comments = self.extract_comment_text(comments_data)
            
            print(f"Retrieved {len(comments)} comments")
            return comments
            
        except Exception as e:
            print(f"Error: {e}")
            return []
    
    def extract_comment_text(self, comments_data):
        """
        Recursively extract comment text from nested structure
        """
        comment_texts = []
        for comment_item in comments_data:
            # Skip "more" objects and deleted comments
            if comment_item.get('kind') != 't1':
                continue
                
            comment_data = comment_item.get('data', {})
            
            # Get comment text
            body = comment_data.get('body', '').strip()
            
            # Skip deleted/removed comments
            if body and body not in ['[deleted]', '[removed]', '']:
                comment_texts.append(body)
            
            # Get nested replies
            replies = comment_data.get('replies')
            if replies and isinstance(replies, dict):
                nested_comments = self.extract_comment_text(replies['data']['children'])
                comment_texts.extend(nested_comments)
        
        return comment_texts
    
    def analyze_comments_with_claude(self, comments, analysis_type="sentiment"):
        """
        Analyze comments using Claude AI
        
        Args:
            comments: List of comment strings
            analysis_type: Type of analysis ("sentiment", "summary", "themes", "custom")
        
        Returns:
            Analysis results from Claude
        """
        if not self.claude_client:
            return "Claude API not available. Please set ANTHROPIC_API_KEY environment variable."
        
        # Prepare comments text (limit to avoid token limits)
        comments_text = "\n\n".join(comments[:50])  # Limit to first 50 comments
        
        # Define analysis prompts
        prompts = {
            "sentiment": "Analyze the sentiment of these Reddit comments. Provide a summary of overall sentiment and identify key positive/negative themes.",
            "summary": "Summarize the main topics and themes discussed in these Reddit comments.",
            "themes": "Identify the main themes and topics in these Reddit comments. Group similar comments together.",
            "custom": "Analyze these Reddit comments and provide insights about the discussion."
        }
        
        prompt = prompts.get(analysis_type, prompts["custom"])
        
        try:
            message = self.claude_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=1000,
                messages=[{
                    "role": "user",
                    "content": f"{prompt}\n\nComments:\n{comments_text}"
                }]
            )
            
            return message.content[0].text
            
        except Exception as e:
            return f"Error analyzing with Claude: {e}"
    
    def save_comments_and_analysis(self, comments, analysis, filename="reddit_analysis.csv"):
        """
        Save comments and analysis to CSV
        """
        try:
            # Create DataFrame with comments and analysis
            df = pd.DataFrame({
                'comment_text': comments,
                'analysis': [analysis] * len(comments)  # Same analysis for all comments
            })
            
            df.to_csv(filename, index=False)
            print(f"Saved {len(comments)} comments and analysis to {filename}")
            
        except Exception as e:
            print(f"Error saving to CSV: {e}")
    
    def run_full_analysis(self, thread_url, analysis_type="sentiment", comment_limit=100):
        """
        Complete workflow: scrape comments, analyze with Claude, save results
        """
        print("Starting Reddit + Claude Analysis...")
        print("=" * 50)
        
        # Step 1: Get comments
        comments = self.get_comments_only(thread_url, comment_limit)
        
        if not comments:
            print("No comments found!")
            return
        
        # Step 2: Analyze with Claude
        print(f"\nAnalyzing comments with Claude ({analysis_type})...")
        analysis = self.analyze_comments_with_claude(comments, analysis_type)
        
        # Step 3: Save results
        self.save_comments_and_analysis(comments, analysis)
        
        # Step 4: Display results
        print(f"\nAnalysis Results:")
        print("=" * 30)
        print(analysis)
        
        return comments, analysis

# Example usage and helper functions
def analyze_reddit_thread(thread_url, analysis_type="sentiment", api_key=None):
    """
    Quick function to analyze a Reddit thread with Claude
    """
    analyzer = RedditClaudeAnalyzer(api_key)
    return analyzer.run_full_analysis(thread_url, analysis_type)

def setup_environment():
    """
    Instructions for setting up the environment
    """
    print("Claude Integration Setup Instructions:")
    print("=" * 40)
    print("1. Get your Claude API key from: https://console.anthropic.com/")
    print("2. Set environment variable:")
    print("   export ANTHROPIC_API_KEY='your-api-key-here'")
    print("3. Install required package:")
    print("   pip install anthropic")
    print("4. Run the analysis!")

if __name__ == "__main__":
    # Example usage
    example_url = "https://www.reddit.com/r/StockMarket/comments/1nfd9wi/new_tariff_rules_bring_maximum_chaos_as_surprise/"
    
    print("Reddit + Claude Analysis Tool")
    print("=" * 40)
    
    # Check if API key is available
    if not os.getenv('ANTHROPIC_API_KEY'):
        setup_environment()
        print("\nPlease set your API key and try again.")
    else:
        # Run analysis
        analyzer = RedditClaudeAnalyzer()
        
        # Choose analysis type
        analysis_types = {
            "1": "sentiment",
            "2": "summary", 
            "3": "themes",
            "4": "custom"
        }
        
        print("Choose analysis type:")
        print("1. Sentiment Analysis")
        print("2. Summary")
        print("3. Theme Identification")
        print("4. Custom Analysis")
        
        choice = input("Enter choice (1-4): ").strip()
        analysis_type = analysis_types.get(choice, "sentiment")
        
        # Run the analysis
        comments, analysis = analyzer.run_full_analysis(example_url, analysis_type)
