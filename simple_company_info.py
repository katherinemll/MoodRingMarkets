#!/usr/bin/env python3
"""
Simple function to get company name, executives, and products from stock ticker
Returns a clean dictionary with the exact information you need
"""

import yfinance as yf
import re
from typing import Dict, List

def get_company_info(ticker: str) -> List[str]:
    """
    Get company name, executive names, and top products from stock ticker
    Returns a single list with: [company_name, executive1, executive2, ..., product1, product2, ...]
    
    Args:
        ticker (str): Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'GOOGL')
        
    Returns:
        List[str]: Single list containing company name, executives, and products
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

# Example usage
if __name__ == "__main__":
    # Test the function
    test_tickers = ['MYPSW', 'AAPL', 'MSFT']
    
    print("Company Information Extractor")
    print("=" * 50)
    
    for ticker in test_tickers:
        print(f"\n📊 {ticker}:")
        print("-" * 30)
        
        info = get_company_info(ticker)
        
        print(f"All info: {info}")
        print(f"Total items: {len(info)}")
    