import requests
import csv
import json
import time
from datetime import datetime
import pandas as pd
from bs4 import BeautifulSoup
import re
import yfinance as yf

def scrape_reddit_json_to_csv(subreddit, limit):
    """
    Scrape a given subreddit using JSON API and save to CSV
    """
    output_file = f"reddit_{subreddit}.csv"
    url = f"https://www.reddit.com/r/{subreddit}.json"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    params = {
        'limit': min(limit, 100),  # Improvement: Consider fixing to scroll neew when no useful content
        'sort': 'hot'  # Can be 'hot', 'new', 'rising', 'top'
    }
    
    try:
        print(f"Fetching data from r/{subreddit}...")
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        data = response.json()
        posts = data['data']['children']
        
        # Prepare data for CSV
        csv_data = []
        
        for post in posts:
            post_data = post['data']
            
            csv_row = {
                'title': post_data.get('title', ''),
                'author': post_data.get('author', ''),
                'score': post_data.get('score', 0),
                'upvote_ratio': post_data.get('upvote_ratio', 0),
                'num_comments': post_data.get('num_comments', 0),
                'created_utc': datetime.fromtimestamp(post_data.get('created_utc', 0)).strftime('%Y-%m-%d %H:%M:%S'),
                'url': post_data.get('url', ''),
                'permalink': f"https://www.reddit.com{post_data.get('permalink', '')}",
                'selftext': post_data.get('selftext', '')[:500],  # Limit text length
                'flair': post_data.get('link_flair_text', ''),
                'is_video': post_data.get('is_video', False),
                'over_18': post_data.get('over_18', False),
                'gilded': post_data.get('gilded', 0),
                'domain': post_data.get('domain', ''),
                'post_id': post_data.get('id', '')
            }
            
            csv_data.append(csv_row)
        
        # Write to CSV
        if csv_data:
            df = pd.DataFrame(csv_data)
            df.to_csv(output_file, index=False, encoding='utf-8')
            print(f"Successfully saved {len(csv_data)} posts to {output_file}")
            return df
        else:
            print("No data found")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

class RedditCommentsScraper:
    """
    Simple scraper to extract only comment content from Reddit threads
    """
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    
    def get_comments_only(self, thread_url, delay, comment_limit=100):
        """
        Extract only comment content from a Reddit thread
        
        Args:
            thread_url: Reddit thread URL
            comment_limit: Max number of comments to get
            
        Returns:
            List of comment text strings
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
    
            # Check for rate limiting before raising other HTTP errors
            if response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', delay))
                print(f"Rate limited. Waiting {retry_after} seconds...")
                time.sleep(retry_after)
                
                # Retry the request after waiting
                response = requests.get(json_url, headers=self.headers, params=params)
            
            # Now check for other HTTP errors
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
                
            comment_data = comment_item.get('data', {}).replace('\n', ' ').replace('\r', ' ')
            
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

#insert 
def scrape_topic_reddit(words, path, ticker):
    df_url = []
    with open(path, 'r', encoding='utf-8') as file:
            # Create CSV reader
            csv_reader = csv.reader(file)
            
            # Get header row
            headers = next(csv_reader)
            # Access each row
            for row_num, row in enumerate(csv_reader, 1):
                for word in words:
                    if word in row[0] or word in row[8]:
                        df_url.append(row[6])
#    print(df_url)
    comments = []
    for url in df_url:
        scraper = RedditCommentsScraper()
        comments = scraper.get_comments_only(url,30)
    
    # Save comments to CSV
    if comments:
        df = pd.DataFrame({'content': comments})
        df.to_csv(f"reddit_comments_{ticker}.csv", index=False)
        print(f"Saved {len(comments)} comments to reddit_comments_{ticker}.csv")
    else:
        print("No comments to save")
    return comments

def get_company_info(ticker: str) -> list[str]:
    """
    Get company name, executive names, and top products from stock ticker
    """
    
    try:        
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Company name - clean up "Ltd.", "Inc.", etc.
        company_name = info.get('longName') or info.get('shortName') or f"Company {ticker}"
        # Remove common suffixes
        suffixes_to_remove = [' Ltd.', ' Inc.', ' Corp.', ' Corporation', ' Co.', ' Company', ' LLC', ' L.P.', ' LP']
        for suffix in suffixes_to_remove:
            if company_name.endswith(suffix):
                company_name = company_name[:-len(suffix)]
                break
        
        # Extract executives
        executives = []
        if 'companyOfficers' in info and info['companyOfficers']:
            for officer in info['companyOfficers'][:5]:  # Top 5
                if isinstance(officer, dict):
                    name = officer.get('name', '')
                    if name:
                        # Remove common prefixes like "Mr.", "Ms.", "Dr.", etc.
                        prefixes_to_remove = ['Mr. ', 'Ms. ', 'Dr. ', 'Mrs. ', 'Prof. ']
                        for prefix in prefixes_to_remove:
                            if name.startswith(prefix):
                                name = name[len(prefix):]
                                break
                        
                        # Remove middle names/initials - keep only first and last name
                        name_parts = name.split()
                        if len(name_parts) >= 2:
                            # Keep first and last name only
                            clean_name = f"{name_parts[0]} {name_parts[-1]}"
                        else:
                            clean_name = name
                        
                        executives.append(clean_name)
        
        # Extract products from business summary
        products = []
        business_summary = info.get('longBusinessSummary', '')
        
        if business_summary:
            # Clean up the business summary and extract key products
            summary = business_summary.replace('\n', ' ').replace('\r', ' ')
            
            # Look for specific product mentions
            product_keywords = [
                'iPhone', 'iPad', 'Mac', 'Apple Watch', 'AirPods',  # Apple
                'Windows', 'Office', 'Azure', 'Xbox', 'Teams',      # Microsoft
                'Android', 'Chrome', 'Gmail', 'YouTube', 'Search',  # Google
                'Model S', 'Model 3', 'Model X', 'Model Y', 'Cybertruck',  # Tesla
                'GPU', 'GeForce', 'Quadro', 'Tesla', 'Jetson',     # NVIDIA
                'Facebook', 'Instagram', 'WhatsApp', 'Quest VR'  #Meta


            ]
            
            found_products = []
            for keyword in product_keywords:
                if keyword.lower() in summary.lower():
                    found_products.append(keyword)
            
            # If we found specific products, use them
            if found_products:
                products = found_products[:5]
                
        if not products:
            products = []
        
        # Merge everything into one single list
        result = [company_name] + executives[:5] + products[:5]
        
        return result
        
    except Exception as e:
        return [f"Company {ticker}", "Information not available", "Information not available"]


def reddit_scrape(ticker,limit):
    info = get_company_info(ticker)
    subreddits = ['StockMarket','Bogleheads','popculturechat','investing','stocks','personalfinance','wallstreetbets','pennystocks','SecurityAnalysis','BusinessOfMedia','Economics']
    comments = []
    for subreddit in subreddits:
        path = scrape_reddit_json_to_csv(subreddit, limit)
        comments += scrape_topic_reddit(info,f"reddit_{subreddit}.csv",ticker)
    print(f"\n{len(comments)} discussions found about {ticker}!\n)")
    return comments

comments = reddit_scrape('NVDA',100)
comments = reddit_scrape('ORCL',100)
comments = reddit_scrape('AMZN',100)
comments = reddit_scrape('AAPL',100)
comments = reddit_scrape('MSFT',100)
comments = reddit_scrape('TSLA',100)