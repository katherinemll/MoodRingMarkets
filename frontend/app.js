// Global state
let stocksData = [];
let isLoading = false;

// Utility functions
function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function formatPriceChange(change, percent) {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

function getSentimentColor(score) {
  // Convert 0-100 score to HSL color (red to green)
  const hue = (score / 100) * 120; // 0 = red, 120 = green
  return `hsl(${hue}, 70%, 50%)`;
}

function createMoodRing(sentimentScore) {
  const color = getSentimentColor(sentimentScore);
  const percentage = sentimentScore;
  const degrees = (percentage / 100) * 360;
  
  // Create a proper conic gradient that fills the ring
  const gradient = `conic-gradient(from 0deg, ${color} 0deg, ${color} ${degrees}deg, rgba(255,255,255,0.1) ${degrees}deg, rgba(255,255,255,0.1) 360deg)`;
  
  return {
    background: gradient,
    boxShadow: `0 0 30px ${color}60`
  };
}

// API functions
async function fetchStocks() {
  try {
    const response = await fetch('/api/stocks');
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching stocks:', error);
    return [];
  }
}

async function fetchStockDetails(symbol) {
  try {
    const response = await fetch(`/api/stocks/${symbol}`);
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return null;
  }
}

// UI functions
function createStockCard(stock) {
  const moodRing = createMoodRing(stock.sentimentScore);
  const priceChangeClass = stock.priceChange >= 0 ? 'positive' : 'negative';
  const sentimentLabel = getSentimentLabel(stock.sentimentScore);
  
  return `
    <div class="stock-card" data-symbol="${stock.symbol}">
      <div class="mood-ring-container">
        <div class="ticker-symbol">${stock.symbol}</div>
        <div class="mood-ring" style="background: ${moodRing.background}; box-shadow: ${moodRing.boxShadow};">
          <div class="sentiment-score">${stock.sentimentScore}</div>
        </div>
        <div class="sentiment-label">${sentimentLabel}</div>
      </div>
      <div class="stock-info">
        <h3 class="company-name">${stock.companyName}</h3>
        <div class="price-info">
          <div class="price-label">Current Price</div>
          <div class="price-row">
            <span class="current-price">${formatPrice(stock.currentPrice)}</span>
            <span class="price-change ${priceChangeClass}">
              ${formatPriceChange(stock.priceChange, stock.priceChangePercent)}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getSentimentLabel(score) {
  if (score >= 80) return 'Very Bullish';
  if (score >= 60) return 'Bullish';
  if (score >= 40) return 'Neutral';
  if (score >= 20) return 'Bearish';
  return 'Very Bearish';
}

function renderStocks(stocks) {
  const container = document.getElementById('stocks-container');
  if (!container) return;
  
  container.innerHTML = stocks.map(createStockCard).join('');
  
  // Add click handlers for stock cards
  container.querySelectorAll('.stock-card').forEach(card => {
    card.addEventListener('click', () => {
      const symbol = card.dataset.symbol;
      showStockDetails(symbol);
    });
  });
}

function showStockDetails(symbol) {
  const stock = stocksData.find(s => s.symbol === symbol);
  if (!stock) return;
  
  // For now, just show an alert with the sentiment summary
  // Later this will be replaced with a proper modal
  alert(`${stock.symbol} - ${stock.companyName}\n\nSentiment Analysis:\n${stock.sentimentSummary}`);
}

function showDashboard() {
  const dashboard = document.getElementById('stocks-dashboard');
  if (dashboard) {
    dashboard.classList.add('visible');
  }
}

function hideDashboard() {
  const dashboard = document.getElementById('stocks-dashboard');
  if (dashboard) {
    dashboard.classList.remove('visible');
  }
}

async function loadStocks() {
  if (isLoading) return;
  
  isLoading = true;
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="refresh-icon">⟳</span> Loading...';
  }
  
  try {
    stocksData = await fetchStocks();
    if (stocksData.length > 0) {
      renderStocks(stocksData);
    }
  } catch (error) {
    console.error('Error loading stocks:', error);
  } finally {
    isLoading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span class="refresh-icon">⟳</span> Refresh Data';
    }
  }
}

// Scroll handling
function handleScroll() {
  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;
  
  // Show dashboard when user scrolls down
  if (scrollY > windowHeight * 0.2) {
    showDashboard();
    // Load stocks when dashboard becomes visible
    if (stocksData.length === 0) {
      loadStocks();
    }
  } else {
    hideDashboard();
  }
}

// Event listeners
window.addEventListener("load", () => {
  const preloader = document.getElementById("preloader");
  const welcome = document.getElementById("welcome-screen");
  const chime = document.getElementById("chime");

  // Format date/time
  const dateTime = document.getElementById("date-time");
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  dateTime.textContent = formatted;

  // Wait 3s → fade out loader → play chime → show welcome
  setTimeout(() => {
    if (chime) chime.play();
    if (preloader) preloader.style.opacity = "0";
    setTimeout(() => {
      if (preloader) preloader.style.display = "none";
      if (welcome) welcome.style.display = "flex";
    }, 1000);
  }, 3000);
});

// Scroll event listener
window.addEventListener('scroll', handleScroll);

// Refresh button
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadStocks);
  }
});
