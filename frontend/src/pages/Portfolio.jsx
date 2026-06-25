import { useState, useEffect } from 'react';
import { getPortfolios, createPortfolio, updatePortfolio, deletePortfolio } from '../api/portfolio';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Brain, Trash2, Edit, Search } from 'lucide-react';
import { motion } from 'motion/react';

// Mock holdings helper to pre-populate list on first view of default portfolios
const INITIAL_MOCK_HOLDINGS = {
  'Growth Portfolio': [
    { id: 'h1', ticker: 'AAPL', shares: 50, buyPrice: 150.00, buyDate: '2024-01-15', currentPrice: 185.50 },
    { id: 'h2', ticker: 'MSFT', shares: 30, buyPrice: 320.00, buyDate: '2024-02-20', currentPrice: 380.25 },
    { id: 'h3', ticker: 'GOOGL', shares: 20, buyPrice: 125.00, buyDate: '2024-03-10', currentPrice: 142.80 },
  ],
  'Dividend Portfolio': [
    { id: 'h4', ticker: 'KO', shares: 200, buyPrice: 58.00, buyDate: '2024-01-05', currentPrice: 56.20 },
    { id: 'h5', ticker: 'JNJ', shares: 100, buyPrice: 165.00, buyDate: '2024-02-12', currentPrice: 162.40 },
  ],
  'Tech Focus': [
    { id: 'h6', ticker: 'NVDA', shares: 80, buyPrice: 450.00, buyDate: '2024-01-08', currentPrice: 875.30 },
    { id: 'h7', ticker: 'AMD', shares: 150, buyPrice: 125.00, buyDate: '2024-02-15', currentPrice: 165.50 },
  ]
};

function Portfolio() {
  const { token } = useAuth();
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);

  // Modals / forms states
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [editingPortfolioId, setEditingPortfolioId] = useState(null);
  const [editPortfolioName, setEditPortfolioName] = useState('');

  const [showAddStock, setShowAddStock] = useState(false);
  const [newStockTicker, setNewStockTicker] = useState('');
  const [newStockShares, setNewStockShares] = useState('');
  const [newStockBuyPrice, setNewStockBuyPrice] = useState('');
  const [newStockBuyDate, setNewStockBuyDate] = useState('');

  const [showAIAnalysis, setShowAIAnalysis] = useState(false);

  // Fetch portfolios from API
  useEffect(() => {
    if (token) {
      fetchPortfolios();
    }
  }, [token]);

  async function fetchPortfolios() {
    const data = await getPortfolios(token);
    if (Array.isArray(data)) {
      setPortfolios(data);
    } else {
      setPortfolios([]);
    }
  }

  // Create new portfolio
  async function handleCreatePortfolio(e) {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;
    const created = await createPortfolio(token, newPortfolioName);
    if (!created.error) {
      setPortfolios([...portfolios, created]);
      setNewPortfolioName('');
      setShowAddPortfolio(false);
    }
  }

  // Update portfolio name
  async function handleUpdatePortfolio(e, id) {
    e.preventDefault();
    if (!editPortfolioName.trim()) return;
    const result = await updatePortfolio(token, id, editPortfolioName);
    if (!result.error) {
      setPortfolios(portfolios.map(p => (p.id === id ? { ...p, name: editPortfolioName } : p)));
      setEditingPortfolioId(null);
      setEditPortfolioName('');
      if (selectedPortfolio && selectedPortfolio.id === id) {
        setSelectedPortfolio({ ...selectedPortfolio, name: editPortfolioName });
      }
    }
  }

  // Delete portfolio
  async function handleDeletePortfolio(id) {
    const result = await deletePortfolio(token, id);
    if (!result.error) {
      setPortfolios(portfolios.filter(p => p.id !== id));
      if (selectedPortfolio && selectedPortfolio.id === id) {
        setSelectedPortfolio(null);
      }
    }
  }

  // Load holdings for a specific portfolio from localStorage
  function getHoldings(portfolio) {
    if (!portfolio) return [];
    const key = `atlas_portfolio_stocks_${portfolio.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
    // If not found, check if it's one of the initial default portfolios
    const defaultHoldings = INITIAL_MOCK_HOLDINGS[portfolio.name];
    if (defaultHoldings) {
      localStorage.setItem(key, JSON.stringify(defaultHoldings));
      return defaultHoldings;
    }
    return [];
  }

  // Add stock to holdings
  function handleAddStock(e) {
    e.preventDefault();
    if (!newStockTicker.trim() || !newStockShares || !newStockBuyPrice) return;

    const currentPriceFloat = parseFloat(newStockBuyPrice) * (1 + (Math.random() * 0.3 - 0.05)); // Simulated change

    const newStockObj = {
      id: Math.random().toString(),
      ticker: newStockTicker.toUpperCase(),
      shares: parseFloat(newStockShares),
      buyPrice: parseFloat(newStockBuyPrice),
      buyDate: newStockBuyDate || new Date().toISOString().split('T')[0],
      currentPrice: parseFloat(currentPriceFloat.toFixed(2))
    };

    const currentHoldings = getHoldings(selectedPortfolio);
    const updatedHoldings = [...currentHoldings, newStockObj];

    const key = `atlas_portfolio_stocks_${selectedPortfolio.id}`;
    localStorage.setItem(key, JSON.stringify(updatedHoldings));

    // Reset stock fields
    setNewStockTicker('');
    setNewStockShares('');
    setNewStockBuyPrice('');
    setNewStockBuyDate('');
    setShowAddStock(false);
  }

  // Delete stock from holdings
  function handleDeleteStock(stockId) {
    const currentHoldings = getHoldings(selectedPortfolio);
    const updatedHoldings = currentHoldings.filter(s => s.id !== stockId);

    const key = `atlas_portfolio_stocks_${selectedPortfolio.id}`;
    localStorage.setItem(key, JSON.stringify(updatedHoldings));
    
    // Force rerender by updating selectedPortfolio state
    setSelectedPortfolio({ ...selectedPortfolio });
  }

  // Calculate portfolio statistics
  function calculateStats(portfolio) {
    const holdings = getHoldings(portfolio);
    let totalValue = 0;
    let totalCost = 0;

    holdings.forEach(stock => {
      totalValue += stock.shares * stock.currentPrice;
      totalCost += stock.shares * stock.buyPrice;
    });

    const totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      totalValue,
      totalGain,
      gainPercent,
      holdingsCount: holdings.length,
      holdings
    };
  }

  // Render view: Stock Detail
  if (selectedStock && selectedPortfolio) {
    const stats = calculateStats(selectedPortfolio);
    const totalValue = selectedStock.shares * selectedStock.currentPrice;
    const totalCost = selectedStock.shares * selectedStock.buyPrice;
    const gain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;

    return (
      <div className="min-h-screen bg-black relative overflow-hidden text-white pt-24">
        {/* Animated Background */}
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <motion.path
              d="M0,400 Q100,350 200,380 T400,360 T600,340 T800,380 T1000,350 T1200,370 T1400,340 T1600,360 T1800,380 T2000,350"
              stroke="white"
              strokeWidth="2"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-8 py-12">
          {/* Header */}
          <div className="flex items-center gap-6 mb-12">
            <motion.button
              onClick={() => setSelectedStock(null)}
              className="text-white/40 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
              whileHover={{ x: -5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <ArrowLeft className="w-6 h-6" strokeWidth={1} />
            </motion.button>
            <div>
              <h1 className="text-5xl font-light tracking-tight text-white">{selectedStock.ticker}</h1>
              <p className="text-white/40 mt-2">${selectedStock.currentPrice.toFixed(2)}</p>
            </div>
          </div>

          {/* Stock Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 mb-12">
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Shares Owned</p>
              <p className="text-3xl text-white font-light">{selectedStock.shares}</p>
            </div>
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Buy Price</p>
              <p className="text-3xl text-white font-light">${selectedStock.buyPrice.toFixed(2)}</p>
            </div>
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Total Value</p>
              <p className="text-3xl text-white font-light">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Gain/Loss</p>
              <div>
                <p className={`text-3xl font-light ${gain >= 0 ? 'text-white' : 'text-white/60'}`}>
                  {gain >= 0 ? '+' : ''}${Math.abs(gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-white/40 mt-1">
                  ({gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Price Chart Placeholder */}
          <div className="border border-white/5 p-8 mb-12">
            <h3 className="text-sm text-white/40 tracking-wider uppercase mb-6">Price Chart</h3>
            <div className="h-64 flex items-end justify-between gap-2">
              {[...Array(30)].map((_, i) => {
                const height = 20 + Math.random() * 80;
                return (
                  <motion.div
                    key={i}
                    className="flex-1 bg-white/10 hover:bg-white/20 transition-colors"
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.02, duration: 0.5 }}
                  />
                );
              })}
            </div>
          </div>

          {/* Stock Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-white/5 p-8 bg-black">
              <h3 className="text-sm text-white/40 tracking-wider uppercase mb-4">Position Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Purchase Date</span>
                  <span className="text-white">{new Date(selectedStock.buyDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Days Held</span>
                  <span className="text-white">
                    {Math.max(1, Math.floor((new Date().getTime() - new Date(selectedStock.buyDate).getTime()) / (1000 * 60 * 60 * 24)))} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Total Cost</span>
                  <span className="text-white">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
            <div className="border border-white/5 p-8 bg-black">
              <h3 className="text-sm text-white/40 tracking-wider uppercase mb-4">Market Data</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Current Price</span>
                  <span className="text-white">${selectedStock.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Day Change</span>
                  <span className="text-white">+$2.35 (+1.28%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Volume</span>
                  <span className="text-white">54.2M</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render view: Portfolio Detail
  if (selectedPortfolio) {
    const stats = calculateStats(selectedPortfolio);

    return (
      <div className="min-h-screen bg-black relative overflow-hidden text-white pt-24">
        {/* Animated Background */}
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <motion.path
              d="M0,400 Q100,350 200,380 T400,360 T600,340 T800,380 T1000,350 T1200,370 T1400,340 T1600,360 T1800,380 T2000,350"
              stroke="white"
              strokeWidth="2"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-8 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-6">
              <motion.button
                onClick={() => setSelectedPortfolio(null)}
                className="text-white/40 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
                whileHover={{ x: -5 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <ArrowLeft className="w-6 h-6" strokeWidth={1} />
              </motion.button>
              {editingPortfolioId === selectedPortfolio.id ? (
                <form
                  onSubmit={(e) => {
                    handleUpdatePortfolio(e, selectedPortfolio.id);
                  }}
                  className="flex items-center gap-4"
                >
                  <input
                    value={editPortfolioName}
                    onChange={e => setEditPortfolioName(e.target.value)}
                    className="bg-white/5 border border-white/10 text-white px-4 py-2 text-3xl font-light focus:outline-none focus:border-white/30"
                    autoFocus
                  />
                  <button type="submit" className="px-4 py-2 bg-white text-black text-sm tracking-wide hover:bg-white/90 cursor-pointer">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPortfolioId(null)}
                    className="px-4 py-2 border border-white/20 text-white text-sm tracking-wide hover:bg-white/5 bg-transparent cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-4">
                  <h1 className="text-5xl font-light tracking-tight text-white">{selectedPortfolio.name}</h1>
                  <button
                    onClick={() => {
                      setEditingPortfolioId(selectedPortfolio.id);
                      setEditPortfolioName(selectedPortfolio.name);
                    }}
                    className="text-white/40 hover:text-white transition-colors bg-transparent border-0 cursor-pointer p-2"
                  >
                    <Edit className="w-5 h-5" strokeWidth={1} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <motion.button
                onClick={() => setShowAIAnalysis(true)}
                className="px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Brain className="w-4 h-4" strokeWidth={1.5} />
                AI Analysis
              </motion.button>
              <motion.button
                onClick={() => setShowAddStock(true)}
                className="px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add Stock
              </motion.button>
            </div>
          </div>

          {/* Portfolio Stats */}
          <div className="grid grid-cols-3 gap-px bg-white/5 mb-12">
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Total Value</p>
              <p className="text-3xl text-white font-light">${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Total Gain/Loss</p>
              <div className="flex items-center gap-2">
                <p className={`text-3xl font-light ${stats.totalGain >= 0 ? 'text-white' : 'text-white/60'}`}>
                  {stats.totalGain >= 0 ? '+' : '-'}${Math.abs(stats.totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="bg-black border border-white/5 p-8">
              <p className="text-xs text-white/40 mb-2 tracking-wider uppercase">Return</p>
              <div className="flex items-center gap-3">
                <p className={`text-3xl font-light ${stats.gainPercent >= 0 ? 'text-white' : 'text-white/60'}`}>
                  {stats.gainPercent >= 0 ? '+' : ''}{stats.gainPercent.toFixed(2)}%
                </p>
                {stats.gainPercent >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-white/40" strokeWidth={1} />
                ) : (
                  <TrendingDown className="w-6 h-6 text-white/40" strokeWidth={1} />
                )}
              </div>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="border border-white/5">
            <div className="grid grid-cols-7 gap-4 p-6 border-b border-white/5 bg-black">
              <p className="text-xs text-white/40 tracking-wider uppercase">Ticker</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Shares</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Buy Price</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Current Price</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Total Value</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Gain/Loss</p>
              <p className="text-xs text-white/40 tracking-wider uppercase">Actions</p>
            </div>
            {stats.holdings.length === 0 ? (
              <div className="p-8 text-center bg-black">
                <p className="text-white/40 text-sm">No holdings yet. Click "Add Stock" to add your first position!</p>
              </div>
            ) : (
              stats.holdings.map((stock) => {
                const totalValue = stock.shares * stock.currentPrice;
                const totalCost = stock.shares * stock.buyPrice;
                const gain = totalValue - totalCost;
                const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;

                return (
                  <motion.div
                    key={stock.id}
                    className="grid grid-cols-7 gap-4 p-6 border-b border-white/5 bg-black hover:bg-white/[0.02] cursor-pointer transition-all"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    onClick={() => setSelectedStock(stock)}
                  >
                    <p className="text-white font-medium">{stock.ticker}</p>
                    <p className="text-white/60">{stock.shares}</p>
                    <p className="text-white/60">${stock.buyPrice.toFixed(2)}</p>
                    <p className="text-white/60">${stock.currentPrice.toFixed(2)}</p>
                    <p className="text-white font-light">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <div>
                      <p className={gain >= 0 ? 'text-white' : 'text-white/60'}>
                        {gain >= 0 ? '+' : ''}${Math.abs(gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-white/40 font-light">
                        ({gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%)
                      </p>
                    </div>
                    <motion.button
                      className="text-white/40 hover:text-white transition-colors bg-transparent border-0 cursor-pointer self-center"
                      whileHover={{ scale: 1.1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStock(stock.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1} />
                    </motion.button>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Add Stock Modal */}
        {showAddStock && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddStock(false)}>
            <motion.div
              className="bg-black border border-white/10 p-8 max-w-md w-full mx-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl text-white mb-6 tracking-wide font-light">Add Stock</h2>
              <form onSubmit={handleAddStock} className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Ticker Symbol</label>
                  <input
                    type="text"
                    required
                    value={newStockTicker}
                    onChange={e => setNewStockTicker(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors"
                    placeholder="AAPL"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Shares</label>
                  <input
                    type="number"
                    required
                    min="0.0001"
                    step="any"
                    value={newStockShares}
                    onChange={e => setNewStockShares(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors"
                    placeholder="10"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Buy Price ($)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={newStockBuyPrice}
                    onChange={e => setNewStockBuyPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors"
                    placeholder="150.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Buy Date</label>
                  <input
                    type="date"
                    value={newStockBuyDate}
                    onChange={e => setNewStockBuyDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div className="flex gap-4 mt-8 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddStock(false)}
                    className="flex-1 px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-6 py-3 bg-white text-black text-sm tracking-wide hover:bg-white/90 transition-all cursor-pointer">
                    Add Stock
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* AI Analysis Modal */}
        {showAIAnalysis && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAIAnalysis(false)}>
            <motion.div
              className="bg-black border border-white/10 p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <Brain className="w-6 h-6 text-white" strokeWidth={1} />
                <h2 className="text-2xl text-white tracking-wide font-light">AI Portfolio Analysis</h2>
              </div>
              <div className="space-y-6">
                <div className="border border-white/5 p-6 bg-black">
                  <h3 className="text-sm text-white/40 tracking-wider uppercase mb-3">Overall Assessment</h3>
                  <p className="text-white/80 leading-relaxed text-sm">
                    Your portfolio shows returns generated by key holdings.
                    {stats.gainPercent >= 0 
                      ? ` Performance is in positive territory with a return of ${stats.gainPercent.toFixed(2)}%.` 
                      : ` Performance is currently down by ${Math.abs(stats.gainPercent).toFixed(2)}%.`}
                    {' '}The asset concentration offers direct exposure, though sector balancing is recommended to lower risk.
                  </p>
                </div>
                <div className="border border-white/5 p-6 bg-black">
                  <h3 className="text-sm text-white/40 tracking-wider uppercase mb-3">Recommendations</h3>
                  <ul className="space-y-2 text-white/80 text-sm pl-4 list-disc">
                    <li>Consider diversifying across defensive sectors to decrease correlation and sector volatility.</li>
                    <li>Utilize dollar-cost averaging when initiating new equity nodes.</li>
                    <li>Evaluate highest performing nodes for partial profit reallocation.</li>
                  </ul>
                </div>
                <div className="border border-white/5 p-6 bg-black">
                  <h3 className="text-sm text-white/40 tracking-wider uppercase mb-3">Risk Analysis</h3>
                  <p className="text-white/80 leading-relaxed text-sm">
                    Portfolio risk score: <span className="text-white">Medium</span>.
                    Volatility is currently tied to stock selection parameters. Diversified bonds or index ETFs could decrease structural correlation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAIAnalysis(false)}
                className="w-full mt-8 px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  // Render view: Portfolio Grid (Main Portfolios View)
  return (
    <div className="min-h-screen bg-black relative overflow-hidden text-white pt-24">
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M0,400 Q100,350 200,380 T400,360 T600,340 T800,380 T1000,350 T1200,370 T1400,340 T1600,360 T1800,380 T2000,350"
            stroke="white"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-16">
          <h1 className="text-5xl font-light tracking-tight text-white">Portfolios</h1>
          <motion.button
            onClick={() => setShowAddPortfolio(true)}
            className="px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New Portfolio
          </motion.button>
        </div>

        {/* Add Portfolio Inline Form / Dialog */}
        {showAddPortfolio && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddPortfolio(false)}>
            <motion.div
              className="bg-black border border-white/10 p-8 max-w-md w-full mx-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl text-white mb-6 tracking-wide font-light">Create Portfolio</h2>
              <form onSubmit={handleCreatePortfolio} className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Portfolio Name</label>
                  <input
                    type="text"
                    required
                    value={newPortfolioName}
                    onChange={e => setNewPortfolioName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors"
                    placeholder="e.g. Retirement Savings"
                  />
                </div>
                <div className="flex gap-4 mt-8 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddPortfolio(false)}
                    className="flex-1 px-6 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-6 py-3 bg-white text-black text-sm tracking-wide hover:bg-white/90 transition-all cursor-pointer">
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Portfolios Grid */}
        {portfolios.length === 0 ? (
          <div className="text-center py-20 border border-white/5 bg-black">
            <p className="text-white/40 mb-6">You don't have any portfolios yet.</p>
            <button
              onClick={() => setShowAddPortfolio(true)}
              className="px-6 py-3 bg-white text-black text-sm tracking-wide hover:bg-white/90 cursor-pointer border-0"
            >
              Create Your First Portfolio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
            {portfolios.map((portfolio) => {
              const stats = calculateStats(portfolio);

              return (
                <motion.div
                  key={portfolio.id}
                  className="bg-black border border-white/5 p-8 group cursor-pointer relative overflow-hidden"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  onClick={() => setSelectedPortfolio(portfolio)}
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
                  <div className="relative">
                    <div className="flex justify-between items-start mb-8">
                      <h3 className="text-xl text-white tracking-wide">{portfolio.name}</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete "${portfolio.name}"?`)) {
                            handleDeletePortfolio(portfolio.id);
                          }
                        }}
                        className="text-white/20 hover:text-white transition-colors bg-transparent border-0 cursor-pointer p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-white/40 mb-1 tracking-wider uppercase">Total Value</p>
                        <p className="text-2xl text-white font-light">
                          ${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-white/40 mb-1 tracking-wider uppercase">Total Gain/Loss</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-lg ${stats.totalGain >= 0 ? 'text-white' : 'text-white/60'}`}>
                            {stats.totalGain >= 0 ? '+' : ''}{stats.totalGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <span className={`text-sm ${stats.gainPercent >= 0 ? 'text-white/60' : 'text-white/40'}`}>
                            ({stats.gainPercent >= 0 ? '+' : ''}{stats.gainPercent.toFixed(2)}%)
                          </span>
                          {stats.gainPercent >= 0 ? (
                            <TrendingUp className="w-4 h-4 text-white/40" strokeWidth={1} />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-white/40" strokeWidth={1} />
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <p className="text-xs text-white/40 tracking-wider">{stats.holdingsCount} Holdings</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Portfolio;
