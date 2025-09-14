# Flask Server Setup for MoodRing Markets

This setup provides a Flask backend server that reads sentiment data from the CSV file and serves it to the frontend.

## Quick Start

### Option 1: Using the startup script (Recommended)
```bash
./start.sh
```

### Option 2: Manual startup
1. Install dependencies:
```bash
pip3 install -r requirements.txt
```

2. Start Flask server:
```bash
python3 flask_server.py
```

3. In another terminal, start frontend server:
```bash
cd frontend
python3 -m http.server 3000
```

4. Open http://localhost:3000 in your browser

## API Endpoints

- `GET /api/stocks` - Get all stocks with sentiment data
- `GET /api/stocks/{symbol}` - Get specific stock data
- `POST /api/refresh` - Refresh data from CSV
- `GET /health` - Health check

## Data Source

The Flask server reads from `back-end/combined_sentiment.csv` and processes it to extract:
- Stock symbols and sentiment scores
- AI-generated summaries
- Company information
- Mock price data (for demonstration)

## Features

- **Real-time CSV processing**: Reads sentiment data from the CSV file
- **Stock aggregation**: Combines multiple mentions of the same stock
- **Sentiment scoring**: Converts sentiment scores to 0-100 scale
- **Caching**: Caches processed data for better performance
- **CORS enabled**: Allows frontend to fetch data from different ports

## Troubleshooting

1. **Port conflicts**: If port 5000 or 3000 are in use, modify the ports in the respective files
2. **CSV not found**: Ensure `back-end/combined_sentiment.csv` exists
3. **Dependencies**: Run `pip3 install -r requirements.txt` to install required packages
4. **CORS issues**: The Flask server has CORS enabled for localhost:3000

## Data Processing

The server processes the CSV by:
1. Parsing the `tickers` JSON column to extract stock symbols
2. Aggregating sentiment scores and summaries per stock
3. Converting sentiment scores from -1 to 1 range to 0-100 range
4. Generating mock price data for demonstration
5. Sorting stocks by sentiment score (highest first)
6. Returning top 10 stocks

## File Structure

```
├── flask_server.py          # Main Flask application
├── requirements.txt         # Python dependencies
├── start.sh                # Startup script
├── start_servers.py        # Alternative startup script
├── back-end/
│   └── combined_sentiment.csv  # Data source
└── frontend/
    ├── index.html          # Frontend HTML
    ├── app.js             # Frontend JavaScript (updated for Flask)
    └── styles.css         # Frontend styles
```


