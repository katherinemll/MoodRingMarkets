const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Mock data for top 10 stocks
const mockStocks = [
  {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    currentPrice: 175.43,
    priceChange: 2.34,
    priceChangePercent: 1.35,
    sentimentScore: 78,
    sentimentSummary: "Strong positive sentiment driven by iPhone 15 sales and services growth. Analysts are bullish on AI integration prospects."
  },
  {
    symbol: "TSLA",
    companyName: "Tesla, Inc.",
    currentPrice: 248.87,
    priceChange: -5.23,
    priceChangePercent: -2.06,
    sentimentScore: 45,
    sentimentSummary: "Mixed sentiment due to delivery concerns and competition in EV market. Some concerns about production targets."
  },
  {
    symbol: "NVDA",
    companyName: "NVIDIA Corporation",
    currentPrice: 485.12,
    priceChange: 12.45,
    priceChangePercent: 2.63,
    sentimentScore: 92,
    sentimentSummary: "Extremely bullish sentiment fueled by AI chip demand and data center growth. Strong earnings expectations."
  },
  {
    symbol: "MSFT",
    companyName: "Microsoft Corporation",
    currentPrice: 378.85,
    priceChange: 3.21,
    priceChangePercent: 0.85,
    sentimentScore: 85,
    sentimentSummary: "Positive sentiment around Azure growth and AI integration. Strong enterprise adoption driving confidence."
  },
  {
    symbol: "GOOGL",
    companyName: "Alphabet Inc.",
    currentPrice: 142.56,
    priceChange: -1.23,
    priceChangePercent: -0.86,
    sentimentScore: 67,
    sentimentSummary: "Moderately positive sentiment with some concerns about ad revenue growth and AI competition."
  },
  {
    symbol: "AMZN",
    companyName: "Amazon.com, Inc.",
    currentPrice: 155.23,
    priceChange: 4.56,
    priceChangePercent: 3.03,
    sentimentScore: 73,
    sentimentSummary: "Positive sentiment driven by AWS growth and retail efficiency improvements. Holiday season optimism."
  },
  {
    symbol: "META",
    companyName: "Meta Platforms, Inc.",
    currentPrice: 312.45,
    priceChange: 8.92,
    priceChangePercent: 2.94,
    sentimentScore: 81,
    sentimentSummary: "Strong positive sentiment around metaverse investments and advertising revenue recovery."
  },
  {
    symbol: "NFLX",
    companyName: "Netflix, Inc.",
    currentPrice: 485.67,
    priceChange: -2.34,
    priceChangePercent: -0.48,
    sentimentScore: 58,
    sentimentSummary: "Mixed sentiment with concerns about subscriber growth and content spending efficiency."
  },
  {
    symbol: "AMD",
    companyName: "Advanced Micro Devices, Inc.",
    currentPrice: 112.34,
    priceChange: 3.45,
    priceChangePercent: 3.17,
    sentimentScore: 76,
    sentimentSummary: "Positive sentiment around data center and gaming chip demand. Strong competitive positioning."
  },
  {
    symbol: "CRM",
    companyName: "Salesforce, Inc.",
    currentPrice: 267.89,
    priceChange: 1.23,
    priceChangePercent: 0.46,
    sentimentScore: 69,
    sentimentSummary: "Moderately positive sentiment with focus on AI integration in CRM platform and enterprise adoption."
  }
];

// API Routes
app.get('/api/stocks', (req, res) => {
  res.json({
    success: true,
    data: mockStocks,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stocks/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const stock = mockStocks.find(s => s.symbol === symbol);
  
  if (!stock) {
    return res.status(404).json({
      success: false,
      message: 'Stock not found'
    });
  }
  
  res.json({
    success: true,
    data: stock,
    timestamp: new Date().toISOString()
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MoodRing Markets server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints available:`);
  console.log(`   GET /api/stocks - Top 10 stocks with sentiment`);
  console.log(`   GET /api/stocks/:symbol - Individual stock details`);
});
