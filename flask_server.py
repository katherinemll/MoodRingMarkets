from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import json
import re
from collections import defaultdict
import os

app = Flask(__name__)
CORS(app)

# Path to the CSV file
CSV_PATH = os.path.join(os.path.dirname(__file__), 'back-end', 'combined_sentiment.csv')

def load_and_process_csv():
    """Load and process the CSV data to extract stock information"""
    try:
        # Read the CSV file
        df = pd.read_csv(CSV_PATH)
        
        # Dictionary to store aggregated stock data
        stock_data = defaultdict(lambda: {
            'symbol': '',
            'companyName': '',
            'sentimentScores': [],
            'summaries': [],
            'mentions': 0,
            'currentPrice': 0.0,  # Placeholder - would need real price data
            'priceChange': 0.0,   # Placeholder
            'priceChangePercent': 0.0  # Placeholder
        })
        
        # Process each row
        for _, row in df.iterrows():
            # Parse the tickers JSON
            try:
                tickers_json = json.loads(row['tickers']) if pd.notna(row['tickers']) else {}
            except:
                tickers_json = {}
            
            # Extract sentiment score and summary
            sentiment_score = float(row['score']) if pd.notna(row['score']) else 0.0
            summary = row['summary'] if pd.notna(row['summary']) else ''
            
            # Process each ticker in the row
            for ticker, data in tickers_json.items():
                if isinstance(data, dict) and 'score' in data:
                    stock_data[ticker]['symbol'] = ticker
                    stock_data[ticker]['companyName'] = get_company_name(ticker)
                    stock_data[ticker]['sentimentScores'].append(data['score'])
                    stock_data[ticker]['summaries'].append(data.get('explanation', ''))
                    stock_data[ticker]['mentions'] += 1
            else:
                # If no tickers found, try to extract from summary or other fields
                # Look for common stock symbols in the summary
                symbols_in_summary = extract_symbols_from_text(summary)
                for symbol in symbols_in_summary:
                    stock_data[symbol]['symbol'] = symbol
                    stock_data[symbol]['companyName'] = get_company_name(symbol)
                    stock_data[symbol]['sentimentScores'].append(sentiment_score)
                    stock_data[symbol]['summaries'].append(summary)
                    stock_data[symbol]['mentions'] += 1
        
        # Convert to list and calculate averages
        stocks_list = []
        for symbol, data in stock_data.items():
            if data['mentions'] > 0:  # Only include stocks that were mentioned
                avg_sentiment = sum(data['sentimentScores']) / len(data['sentimentScores'])
                # Convert sentiment score from -1 to 1 range to 0-100 range
                sentiment_score_0_100 = max(0, min(100, (avg_sentiment + 1) * 50))
                
                # Combine all summaries
                combined_summary = ' '.join([s for s in data['summaries'] if s])
                
                stock_info = {
                    'symbol': symbol,
                    'companyName': data['companyName'],
                    'currentPrice': get_mock_price(symbol),  # Mock price data
                    'priceChange': get_mock_price_change(symbol),
                    'priceChangePercent': get_mock_price_change_percent(symbol),
                    'sentimentScore': round(sentiment_score_0_100, 1),
                    'sentimentSummary': combined_summary[:200] + '...' if len(combined_summary) > 200 else combined_summary,
                    'mentions': data['mentions']
                }
                stocks_list.append(stock_info)
        
        # Sort by sentiment score (highest first) and return top 10
        stocks_list.sort(key=lambda x: x['sentimentScore'], reverse=True)
        return stocks_list[:10]
        
    except Exception as e:
        print(f"Error processing CSV: {e}")
        return []

def extract_symbols_from_text(text):
    """Extract potential stock symbols from text"""
    if not text:
        return []
    
    # Common stock symbol patterns (2-5 uppercase letters)
    pattern = r'\b[A-Z]{2,5}\b'
    symbols = re.findall(pattern, text)
    
    # Filter out common words that aren't stock symbols
    common_words = {'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE'}
    
    return [s for s in symbols if s not in common_words and len(s) >= 2]

def get_company_name(symbol):
    """Get company name for a stock symbol"""
    company_names = {
        'AAPL': 'Apple Inc.',
        'TSLA': 'Tesla, Inc.',
        'NVDA': 'NVIDIA Corporation',
        'MSFT': 'Microsoft Corporation',
        'GOOGL': 'Alphabet Inc.',
        'AMZN': 'Amazon.com, Inc.',
        'META': 'Meta Platforms, Inc.',
        'NFLX': 'Netflix, Inc.',
        'AMD': 'Advanced Micro Devices, Inc.',
        'CRM': 'Salesforce, Inc.',
        'ORCL': 'Oracle Corporation',
        'GLD': 'SPDR Gold Trust',
        'IAU': 'iShares Gold Trust',
        'ONDS': 'Ondas Holdings Inc.',
        'OPEN': 'Opendoor Technologies Inc.',
        'FNMA': 'Federal National Mortgage Association',
        'PENGU': 'Penguin International Limited',
        'CULT': 'Cult Collective Inc.',
        'MULTI': 'Multi Commodity Exchange of India Ltd',
        'BABA': 'Alibaba Group Holding Limited',
        'SFTBY': 'SoftBank Group Corp.',
        'SPX': 'S&P 500 Index',
        'COMP': 'NASDAQ Composite',
        'DJI': 'Dow Jones Industrial Average',
        'HSI': 'Hang Seng Index',
        'N225': 'Nikkei 225',
        'KOSPI': 'KOSPI Index',
        'ASX200': 'S&P/ASX 200',
        'SSNLF': 'Samsung Electronics Co., Ltd.',
        'STLA': 'Stellantis N.V.',
        'STOXX': 'STOXX Europe 600',
        'DAX': 'DAX Index',
        'FTSE': 'FTSE 100',
        'ASML': 'ASML Holding N.V.',
        'TSLA': 'Tesla, Inc.',
        'MU': 'Micron Technology, Inc.',
        'WBD': 'Warner Bros. Discovery, Inc.',
        'LYV': 'Live Nation Entertainment, Inc.',
        'WDC': 'Western Digital Corporation',
        'US10Y': '10-Year Treasury Note',
        'SPX': 'S&P 500',
        'COMP': 'NASDAQ Composite',
        'DJIA': 'Dow Jones Industrial Average'
    }
    return company_names.get(symbol, f'{symbol} Corporation')

def get_mock_price(symbol):
    """Generate mock price data for demonstration"""
    # Simple hash-based price generation for consistency
    import hashlib
    hash_val = int(hashlib.md5(symbol.encode()).hexdigest()[:8], 16)
    return round(50 + (hash_val % 500), 2)

def get_mock_price_change(symbol):
    """Generate mock price change data"""
    import hashlib
    hash_val = int(hashlib.md5((symbol + 'change').encode()).hexdigest()[:8], 16)
    return round((hash_val % 20) - 10, 2)

def get_mock_price_change_percent(symbol):
    """Generate mock price change percentage"""
    import hashlib
    hash_val = int(hashlib.md5((symbol + 'percent').encode()).hexdigest()[:8], 16)
    return round((hash_val % 10) - 5, 2)

# Global variable to cache the processed data
cached_stocks_data = None

@app.route('/api/stocks', methods=['GET'])
def get_stocks():
    """Get all stocks with sentiment data"""
    global cached_stocks_data
    
    # Use cached data if available, otherwise process CSV
    if cached_stocks_data is None:
        cached_stocks_data = load_and_process_csv()
    
    return jsonify({
        'success': True,
        'data': cached_stocks_data,
        'timestamp': pd.Timestamp.now().isoformat()
    })

@app.route('/api/stocks/<symbol>', methods=['GET'])
def get_stock(symbol):
    """Get specific stock data by symbol"""
    global cached_stocks_data
    
    if cached_stocks_data is None:
        cached_stocks_data = load_and_process_csv()
    
    symbol = symbol.upper()
    stock = next((s for s in cached_stocks_data if s['symbol'] == symbol), None)
    
    if not stock:
        return jsonify({
            'success': False,
            'message': 'Stock not found'
        }), 404
    
    return jsonify({
        'success': True,
        'data': stock,
        'timestamp': pd.Timestamp.now().isoformat()
    })

@app.route('/api/refresh', methods=['POST'])
def refresh_data():
    """Refresh the cached data by reprocessing the CSV"""
    global cached_stocks_data
    cached_stocks_data = load_and_process_csv()
    
    return jsonify({
        'success': True,
        'message': 'Data refreshed successfully',
        'timestamp': pd.Timestamp.now().isoformat()
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': pd.Timestamp.now().isoformat()
    })

if __name__ == '__main__':
    print("🚀 Starting Flask server for MoodRing Markets...")
    print(f"📊 Loading data from: {CSV_PATH}")
    
    # Pre-load the data
    cached_stocks_data = load_and_process_csv()
    print(f"✅ Loaded {len(cached_stocks_data)} stocks")
    
    app.run(debug=True, host='0.0.0.0', port=5002)
