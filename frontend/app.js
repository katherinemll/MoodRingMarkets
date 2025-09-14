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
  // Convert 0-100 score to a color on the red→yellow→green spectrum
  const percentage = Math.max(0, Math.min(100, score)) / 100;
  
  let r, g, b;
  
  if (percentage < 0.5) {
    // Red to Yellow (0-50%)
    const factor = percentage * 2; // 0 to 1
    r = 255;
    g = Math.round(68 + (221 - 68) * factor); // 68 to 221 (from #ff4444 to #ffdd44)
    b = 68;
  } else {
    // Yellow to Green (50-100%)
    const factor = (percentage - 0.5) * 2; // 0 to 1
    r = Math.round(255 - (255 - 68) * factor); // 255 to 68 (from #ffdd44 to #44ff44)
    g = Math.round(221 + (255 - 221) * factor); // 221 to 255
    b = 68;
  }
  
  return `rgb(${r}, ${g}, ${b})`;
}

function createMoodRing(sentimentScore) {
  const percentage = Math.max(0, Math.min(100, sentimentScore)); // Clamp between 0-100
  const circumference = 2 * Math.PI * 85; // radius = 85 for 220px outer diameter
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Get the solid color based on sentiment score position on the spectrum
  const fillColor = getSentimentColor(sentimentScore);
  
  return `
    <svg class="mood-ring-svg" width="220" height="220" viewBox="0 0 220 220">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <!-- Background ring -->
      <circle
        cx="110"
        cy="110"
        r="85"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        stroke-width="20"
      />
      
      <!-- Progress ring with solid color based on sentiment -->
      <circle
        cx="110"
        cy="110"
        r="85"
        fill="none"
        stroke="${fillColor}"
        stroke-width="20"
        stroke-linecap="round"
        stroke-dasharray="${strokeDasharray}"
        stroke-dashoffset="${strokeDashoffset}"
        transform="rotate(-90 110 110)"
        filter="url(#glow)"
        style="transition: stroke-dashoffset 0.5s ease-in-out;"
      />
      
      <!-- Inner circle background -->
      <circle
        cx="110"
        cy="110"
        r="75"
        fill="#0e0f1a"
        style="box-shadow: inset 0 0 20px rgba(0,0,0,0.8);"
      />
    </svg>
  `;
}

// API functions
async function fetchStocks() {
  try {
    const response = await fetch('http://localhost:5002/api/stocks');
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching stocks:', error);
    return [];
  }
}

async function fetchStockDetails(symbol) {
  try {
    const response = await fetch(`http://localhost:5002/api/stocks/${symbol}`);
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return null;
  }
}

// UI functions
function alignWelcomeLogoToTitleBaseline() {
  const screen = document.getElementById('welcome-screen');
  if (!screen) return;
  const title = screen.querySelector('h1');
  const logo = screen.querySelector('.welcome-logo');
  if (!title || !logo) return;

  const titleRect = title.getBoundingClientRect();
  const screenRect = screen.getBoundingClientRect();
  // Align the logo's center to the title's visual center
  const centerYViewport = titleRect.top + titleRect.height / 2;
  const centerYWithinScreen = centerYViewport - screenRect.top;

  logo.style.top = `${centerYWithinScreen}px`;
  logo.style.transform = 'translateY(-50%)';
}
function createStockCard(stock) {
  const moodRingSvg = createMoodRing(stock.sentimentScore);
  const priceChangeClass = stock.priceChange >= 0 ? 'positive' : 'negative';
  const sentimentLabel = getSentimentLabel(stock.sentimentScore);
  
  return `
    <div class="stock-card" data-symbol="${stock.symbol}">
      <div class="mood-ring-container">
        <div class="ticker-symbol">${stock.symbol}</div>
        <div class="mood-ring">
          ${moodRingSvg}
          <div class="sentiment-score">${stock.sentimentScore}</div>
        </div>
        <div class="sentiment-label">${sentimentLabel}</div>
      </div>
      <div class="stock-info">
        <div class="stock-details">
          <h3 class="company-name">${stock.companyName}</h3>
          <div class="price-info">
            <div class="price-label">Current Price</div>
            <div class="current-price">${formatPrice(stock.currentPrice)}</div>
            <div class="price-change ${priceChangeClass}">
              ${formatPriceChange(stock.priceChange, stock.priceChangePercent)}
            </div>
          </div>
        </div>
        <div class="ai-summary-container">
          <div class="ai-summary-label">AI Analysis</div>
          <div class="ai-summary-content">
            ${stock.sentimentSummary || 'Analysis pending...'}
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
      // Align logo to title baseline once visible
      requestAnimationFrame(() => alignWelcomeLogoToTitleBaseline());
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
  // Re-align on resize
  window.addEventListener('resize', alignWelcomeLogoToTitleBaseline);
});
