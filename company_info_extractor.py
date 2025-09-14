#!/usr/bin/env python3
"""
Simple function to extract company name, executive names, and top products from stock ticker
"""

import yfinance as yf
import requests
import json
from typing import Dict, List, Optional

def get_company_key_info(ticker: str) -> Dict[str, any]:
    """
    Extract company name, executive names, and top product names from stock ticker
    
    Args:
        ticker (str): Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'GOOGL')
        
    Returns:
        Dict containing:
        - company_name: Full company name
        - executives: List of executive names and titles
        - products: List of top products/services
        - error: Error message if any
    """
    
    result = {
        'company_name': None,
        'executives': [],
        'products': [],
        'error': None
    }
    
    try:
        print(f"Fetching data for {ticker}...")
        
        # Get stock info using yfinance
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Extract company name
        company_name = info.get('longName') or info.get('shortName') or info.get('name')
        result['company_name'] = company_name
        
        # Extract executives from company info
        executives = []
        
        # Common executive fields in yfinance
        exec_fields = [
            'companyOfficers',  # List of officers
            'keyExecutives',    # Alternative field
        ]
        
        for field in exec_fields:
            if field in info and info[field]:
                if isinstance(info[field], list):
                    for officer in info[field][:5]:  # Top 5 executives
                        if isinstance(officer, dict):
                            name = officer.get('name', '')
                            title = officer.get('title', '')
                            if name:
                                executives.append(f"{name} - {title}")
                        elif isinstance(officer, str):
                            executives.append(officer)
                break
        
        # If no executives found in yfinance, try to get from business summary
        if not executives:
            business_summary = info.get('longBusinessSummary', '')
            if business_summary:
                # Look for common executive patterns in the summary
                import re
                ceo_patterns = [
                    r'CEO[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)',
                    r'Chief Executive Officer[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)',
                    r'led by ([A-Z][a-z]+ [A-Z][a-z]+)',
                ]
                
                for pattern in ceo_patterns:
                    matches = re.findall(pattern, business_summary)
                    if matches:
                        executives.append(f"{matches[0]} - CEO")
                        break
        
        result['executives'] = executives
        
        # Extract products/services
        products = []
        
        # Try to get products from business summary
        business_summary = info.get('longBusinessSummary', '')
        if business_summary:
            # Look for product mentions in business summary
            import re
            
            # Common product/service patterns
            product_patterns = [
                r'products?[:\s]+([^.]{10,100})',
                r'services?[:\s]+([^.]{10,100})',
                r'offers?[:\s]+([^.]{10,100})',
                r'develops?[:\s]+([^.]{10,100})',
                r'manufactures?[:\s]+([^.]{10,100})',
            ]
            
            for pattern in product_patterns:
                matches = re.findall(pattern, business_summary, re.IGNORECASE)
                for match in matches:
                    # Clean up the match
                    clean_match = match.strip().split('.')[0].strip()
                    if len(clean_match) > 10 and clean_match not in products:
                        products.append(clean_match)
                        if len(products) >= 5:  # Limit to top 5
                            break
                if len(products) >= 5:
                    break
        
        # If no products found, try to extract from industry/sector
        if not products:
            industry = info.get('industry', '')
            sector = info.get('sector', '')
            if industry:
                products.append(f"Products in {industry}")
            if sector and sector != industry:
                products.append(f"Services in {sector}")
        
        result['products'] = products[:5]  # Limit to top 5
        
        # If we still don't have much info, add some basic info
        if not result['executives'] and not result['products']:
            result['error'] = "Limited information available from yfinance"
            result['company_name'] = company_name or f"Company {ticker}"
            result['executives'] = ["Executive information not available"]
            result['products'] = [f"Products in {info.get('industry', 'Unknown industry')}"]
        
        print(f"✅ Successfully extracted info for {company_name}")
        
    except Exception as e:
        result['error'] = f"Error fetching data: {str(e)}"
        print(f"❌ Error: {e}")
    
    return result

def get_company_key_info_with_claude(ticker: str, claude_api_key: str = None) -> Dict[str, any]:
    """
    Enhanced version using Claude AI for better executive and product information
    
    Args:
        ticker (str): Stock ticker symbol
        claude_api_key (str): Claude API key (optional)
        
    Returns:
        Dict with enhanced company information
    """
    
    # First get basic info
    result = get_company_key_info(ticker)
    
    if not claude_api_key:
        return result
    
    try:
        # Use Claude to enhance the information
        import os
        if not claude_api_key:
            claude_api_key = os.getenv('ANTHROPIC_API_KEY')
        
        if not claude_api_key:
            return result
        
        from anthropic import Anthropic
        client = Anthropic(api_key=claude_api_key)
        
        company_name = result['company_name'] or ticker
        
        prompt = f"""
        For {company_name} (ticker: {ticker}), provide ONLY:
        
        1. Top 3-5 key executives with their titles
        2. Top 3-5 main products or services
        
        Format as JSON:
        {{
            "executives": ["Name - Title", "Name - Title"],
            "products": ["Product 1", "Product 2", "Product 3"]
        }}
        """
        
        response = client.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        
        claude_text = response.content[0].text
        
        # Try to parse JSON response
        try:
            import re
            json_match = re.search(r'\{.*\}', claude_text, re.DOTALL)
            if json_match:
                claude_data = json.loads(json_match.group())
                result['executives'] = claude_data.get('executives', result['executives'])
                result['products'] = claude_data.get('products', result['products'])
        except:
            # If JSON parsing fails, use the text as is
            result['claude_enhanced'] = claude_text
        
    except Exception as e:
        print(f"Claude enhancement failed: {e}")
    
    return result

# Example usage and testing
if __name__ == "__main__":
    # Test with some popular stocks
    test_tickers = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA']
    
    print("Company Information Extractor")
    print("=" * 50)
    
    for ticker in test_tickers:
        print(f"\n📊 {ticker}:")
        print("-" * 30)
        
        info = get_company_key_info(ticker)
        
        print(f"Company: {info['company_name']}")
        print(f"Executives: {info['executives']}")
        print(f"Products: {info['products']}")
        if info['error']:
            print(f"Error: {info['error']}")
        
        print()
    
    # Example of using the function
    print("\n" + "="*50)
    print("Example Usage:")
    print("="*50)
    print("""
    # Basic usage
    info = get_company_key_info('AAPL')
    print(info)
    
    # With Claude enhancement (if you have API key)
    info = get_company_key_info_with_claude('AAPL', 'your-api-key')
    print(info)
    """)

