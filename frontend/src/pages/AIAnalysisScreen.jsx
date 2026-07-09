import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { TrendingUp, TrendingDown, Star, AlertTriangle, ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Loader2, DollarSign, Brain, Search, Eye, X, CheckCircle, XCircle, Minus } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { getTop500Analysis, refreshTop500, getBudgetSuggestions, analyzeStock } from "../api/ai";
import { getPortfolios } from "../api/portfolio";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

function AIAnalysisScreen() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const lastAutoSearchTicker = useRef("");
  const { currency, convertAndFormat, getCurrencySymbol, EXCHANGE_RATES } = useCurrency();
  const [selectedTab, setSelectedTab] = useState("recommended");
  const [recommendedStocks, setRecommendedStocks] = useState([]);
  const [worstStocks, setWorstStocks] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Budget Advisor State
  const [budget, setBudget] = useState("");
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [budgetAdvice, setBudgetAdvice] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetError, setBudgetError] = useState("");

  // Search & Analyze Tab State
  const [searchTicker, setSearchTicker] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('atlas_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [viewingWatchItem, setViewingWatchItem] = useState(null);

  // Persist watchlist to localStorage
  useEffect(() => {
    localStorage.setItem('atlas_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  async function handleSearchAnalyze(e, forcedTicker = null) {
    e?.preventDefault();
    const ticker = (forcedTicker || searchTicker).trim().toUpperCase();
    if (!ticker) return;
    setSearchTicker(ticker);
    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    setViewingWatchItem(null);
    try {
      const data = await analyzeStock(token, ticker);
      if (data && !data.error) {
        setSearchResult(data);
      } else {
        setSearchError(data?.error || "Failed to analyze stock. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setSearchError("Network error. Make sure the backend is running.");
    } finally {
      setSearchLoading(false);
    }
  }

  function addToWatchlist(analysis) {
    const exists = watchlist.find(w => w.ticker === analysis.ticker);
    if (exists) {
      // Update existing
      setWatchlist(prev => prev.map(w => w.ticker === analysis.ticker ? { ...analysis, savedAt: new Date().toISOString() } : w));
    } else {
      setWatchlist(prev => [{ ...analysis, savedAt: new Date().toISOString() }, ...prev]);
    }
  }

  function removeFromWatchlist(ticker) {
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker));
    if (viewingWatchItem?.ticker === ticker) setViewingWatchItem(null);
  }

  function isInWatchlist(ticker) {
    return watchlist.some(w => w.ticker === ticker);
  }

  useEffect(() => {
    if (token) {
      loadTop500();
      loadPortfolios();
    }
  }, [token]);

  useEffect(() => {
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    if (!token || !ticker || lastAutoSearchTicker.current === ticker) return;

    lastAutoSearchTicker.current = ticker;
    setSelectedTab("all");
    handleSearchAnalyze(null, ticker);
  }, [token, searchParams]);

  async function loadTop500() {
    setIsLoading(true);
    try {
      const data = await getTop500Analysis(token);
      if (data && !data.error) {
        setRecommendedStocks(data.recommended || []);
        setWorstStocks(data.worst || []);
        if (data.lastUpdated) {
          const date = new Date(data.lastUpdated);
          setLastUpdated(date.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }));
        }
      }
    } catch (e) {
      console.error("Error loading top 500 stocks:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const data = await refreshTop500(token);
      if (data && !data.error) {
        setRecommendedStocks(data.recommended || []);
        setWorstStocks(data.worst || []);
        if (data.lastUpdated) {
          const date = new Date(data.lastUpdated);
          setLastUpdated(date.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }));
        }
      }
    } catch (e) {
      console.error("Error refreshing top 500 stocks:", e);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadPortfolios() {
    try {
      const data = await getPortfolios(token);
      if (Array.isArray(data)) {
        setPortfolios(data);
      }
    } catch (e) {
      console.error("Error loading portfolios:", e);
    }
  }

  async function handleBudgetSubmit(e) {
    e.preventDefault();
    if (!budget || parseFloat(budget) <= 0) {
      setBudgetError("Please enter a valid budget amount");
      return;
    }
    setBudgetError("");
    setBudgetLoading(true);
    setBudgetAdvice(null);
    try {
      const rate = EXCHANGE_RATES[currency].rate;
      const budgetInUSD = parseFloat(budget) / rate;
      const res = await getBudgetSuggestions(token, budgetInUSD.toFixed(2), selectedPortfolioId || null);
      if (res && res.error) {
        setBudgetError(res.error);
      } else {
        setBudgetAdvice(res);
      }
    } catch (err) {
      setBudgetError("Failed to get budget advice. Please try again.");
    } finally {
      setBudgetLoading(false);
    }
  }

  const getRecommendationBadge = (recommendation) => {
    const variants = {
      strong_buy: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
      buy: { color: "bg-green-500/20 text-green-400 border-green-500/30" },
      hold: { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
      sell: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
      strong_sell: { color: "bg-red-500/20 text-red-400 border-red-500/30" }
    };

    const config = variants[recommendation] || variants.hold;
    return (
      <Badge className={`${config.color} border`}>
        {recommendation.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const getRiskBadge = (risk) => {
    const colors = {
      low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      high: "bg-red-500/20 text-red-400 border-red-500/30"
    };

    return (
      <Badge className={`${colors[risk]} border`}>
        {risk.toUpperCase()} RISK
      </Badge>
    );
  };

  const StockCard = ({ stock }) => (
    <Card className="bg-card border-border hover:border-white/20 transition-all">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <CardTitle>{stock.ticker}</CardTitle>
              {getRecommendationBadge(stock.recommendation)}
              {getRiskBadge(stock.riskLevel)}
            </div>
            <CardDescription>{stock.name}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl">{convertAndFormat(stock.price)}</div>
            <div className={`flex items-center gap-1 justify-end ${stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stock.change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>
                {stock.change >= 0 ? '+' : '-'}
                {convertAndFormat(Math.abs(stock.change))} ({stock.change >= 0 ? '+' : ''}
                {parseFloat(stock.changePercent).toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confidence and Potential Return */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-white/40 flex items-center gap-2">
              <Star className="w-4 h-4" />
              Confidence
            </div>
            <div className="text-xl">{stock.confidence}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-white/40 flex items-center gap-2">
              {stock.potentialReturn >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              Potential Return
            </div>
            <div className={`text-xl ${stock.potentialReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stock.potentialReturn >= 0 ? '+' : ''}{stock.potentialReturn.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* AI Reasoning */}
        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-white" />
            AI Analysis
          </div>
          <p className="text-sm text-white/60 leading-relaxed">
            {stock.reasoning}
          </p>
        </div>

        {/* Key Points */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Key Points</div>
          <ul className="space-y-1">
            {stock.keyPoints.map((point, idx) => (
              <li key={idx} className="text-sm text-white/60 flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-black text-white p-8 pt-28">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-light tracking-tight">AI Stock Analysis</h1>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="gap-2 border-white/20 text-white bg-transparent hover:bg-white/5 cursor-pointer"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isRefreshing ? "Refreshing..." : "Refresh Analysis"}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Calendar className="w-4 h-4" />
            Last updated: {lastUpdated || "Loading..."}
          </div>
          <p className="text-white/60">
            AI-powered analysis of the top 500 stocks, updated daily with intelligent model insights.
          </p>
        </div>


        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-4 bg-white/5 border border-white/10 p-1 h-11">
            <TabsTrigger value="recommended" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <TrendingUp className="w-4 h-4" />
              Recommended Stocks
            </TabsTrigger>
            <TabsTrigger value="worst" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <TrendingDown className="w-4 h-4" />
              Stocks to Avoid
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <DollarSign className="w-4 h-4" />
              Budget Advisor
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <Search className="w-4 h-4" />
              Search & Analyze
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">Top Recommended Stocks</h2>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  {recommendedStocks.length} stocks analyzed
                </Badge>
              </div>
              
              {isLoading ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                  <p className="text-white/40 text-sm">Loading recommendations...</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="grid gap-4 pr-4">
                    {recommendedStocks.map((stock) => (
                      <StockCard key={stock.ticker} stock={stock} />
                    ))}
                    {recommendedStocks.length === 0 && (
                      <p className="text-white/40 text-center py-12">No recommendations available.</p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="worst" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-light">Stocks to Avoid</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                  {worstStocks.length} stocks flagged
                </Badge>
              </div>
              
              {isLoading ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                  <p className="text-white/40 text-sm">Loading listings...</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="grid gap-4 pr-4">
                    {worstStocks.map((stock) => (
                      <StockCard key={stock.ticker} stock={stock} />
                    ))}
                    {worstStocks.length === 0 && (
                      <p className="text-white/40 text-center py-12">No stocks flagged currently.</p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="budget" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form Input Card */}
              <Card className="bg-card border-border lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-light">
                    <Brain className="w-5 h-5 text-white" />
                    Budget Allocation
                  </CardTitle>
                  <CardDescription className="text-white/40">
                    Input your budget and select an optional portfolio to customize the buy suggestions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleBudgetSubmit} className="space-y-4">
                    <div>
                      <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Investment Budget ({getCurrencySymbol()})</label>
                      <Input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="e.g. 5000"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="bg-white/5 border-white/10 text-white focus:outline-none focus:border-white/30"
                        required
                        disabled={budgetLoading}
                      />
                    </div>
                    
                    {portfolios.length > 0 && (
                      <div>
                        <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Personalize using portfolio</label>
                        <select
                          value={selectedPortfolioId}
                          onChange={(e) => setSelectedPortfolioId(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 text-white px-3 py-3 text-sm focus:outline-none focus:border-white/30 rounded-none cursor-pointer"
                          disabled={budgetLoading}
                        >
                          <option value="" className="bg-black text-white">None (Generic suggestions)</option>
                          {portfolios.map(p => (
                            <option key={p.id} value={p.id} className="bg-black text-white">
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={budgetLoading}
                      className="w-full bg-white text-black hover:bg-white/90 font-medium cursor-pointer py-6"
                    >
                      {budgetLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black mr-2" />
                          Generating Advice...
                        </>
                      ) : (
                        "Get Buy Suggestions"
                      )}
                    </Button>
                  </form>

                  {budgetError && (
                    <Alert variant="destructive" className="mt-4 bg-red-950/20 text-red-400 border-red-500/30">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <AlertDescription>{budgetError}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Advice Results Card */}
              <Card className="bg-card border-border lg:col-span-2">
                <CardHeader>
                  <CardTitle className="font-light">AI Recommendations</CardTitle>
                  <CardDescription className="text-white/40">
                    Optimal stock allocation computed to match your budget and diversification goals.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {budgetAdvice ? (
                    <>
                      <div className="grid grid-cols-3 gap-4 border-b border-white/5 pb-6">
                        <div>
                          <span className="text-xs text-white/40 uppercase block">Total Allocated</span>
                          <span className="text-2xl text-white font-light">{convertAndFormat(budgetAdvice.totalAllocated)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-white/40 uppercase block">Remaining Cash</span>
                          <span className="text-2xl text-white font-light">{convertAndFormat(budgetAdvice.remainingCash)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-white/40 uppercase block">Stocks Selected</span>
                          <span className="text-2xl text-white font-light">{budgetAdvice.purchases?.length || 0}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                          <Brain className="w-4 h-4" /> Allocation Rationale
                        </h4>
                        <p className="text-sm text-white/60 leading-relaxed">{budgetAdvice.reasoning}</p>
                      </div>

                      <div className="space-y-4 pt-2">
                        <h4 className="text-sm font-medium text-white">Suggested Purchases</h4>
                        <div className="grid gap-4">
                          {budgetAdvice.purchases && budgetAdvice.purchases.map((p, idx) => (
                            <div key={idx} className="border border-white/5 p-4 bg-white/[0.01] flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-medium text-white">{p.ticker}</span>
                                  <Badge className="bg-white/5 border border-white/10 text-white/60 text-[10px]">{p.sector}</Badge>
                                </div>
                                <p className="text-xs text-white/40">Buy {p.sharesToBuy} shares at {convertAndFormat(p.pricePerShare)} each</p>
                                <p className="text-xs text-white/60 leading-relaxed mt-2">{p.reason}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-light text-emerald-400">{convertAndFormat(p.cost)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-white/40">
                      <DollarSign className="w-12 h-12 stroke-1 mb-2 opacity-50" />
                      <p className="text-sm">Input your investment budget and click the button to see AI recommendations.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Search + Result */}
              <div className="lg:col-span-2 space-y-6">
                {/* Search Bar */}
                <Card className="bg-white/[0.02] border border-white/10 rounded-none">
                  <CardContent className="p-6">
                    <form onSubmit={handleSearchAnalyze} className="flex items-end gap-3">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Enter Stock Ticker</label>
                        <div className="relative">
                          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                          <Input
                            type="text"
                            placeholder="e.g. NVDA, AAPL, TSLA..."
                            value={searchTicker}
                            onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
                            className="pl-9 bg-white/5 border-white/10 rounded-none text-sm h-11 text-white placeholder-white/20 font-medium tracking-wider"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        disabled={searchLoading || !searchTicker.trim()}
                        className="bg-white text-black hover:bg-white/90 h-11 px-6 rounded-none cursor-pointer font-medium"
                      >
                        {searchLoading ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing...</>
                        ) : (
                          <><Brain className="w-4 h-4 mr-2" /> Analyze</>
                        )}
                      </Button>
                    </form>
                    <p className="text-[11px] text-white/30 mt-3">
                      Uses DeepSeek Pro AI to analyze fundamentals, technicals, and market sentiment in real-time.
                    </p>
                  </CardContent>
                </Card>

                {/* Loading State */}
                {searchLoading && (
                  <Card className="bg-white/[0.02] border border-white/10 rounded-none">
                    <CardContent className="p-12 flex flex-col items-center justify-center space-y-4">
                      <div className="relative">
                        <Loader2 className="w-10 h-10 animate-spin text-white" />
                        <Brain className="w-5 h-5 text-white/40 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm text-white">Analyzing <strong>{searchTicker}</strong>...</p>
                        <p className="text-xs text-white/40">DeepSeek Pro is evaluating fundamentals, technicals, and market conditions</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Error State */}
                {searchError && (
                  <Card className="bg-red-500/5 border border-red-500/20 rounded-none">
                    <CardContent className="p-6 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <p className="text-sm text-red-400">{searchError}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Analysis Result */}
                {(searchResult || viewingWatchItem) && !searchLoading && (() => {
                  const result = viewingWatchItem || searchResult;
                  const isBullish = result.prediction === 'bullish';
                  const isBearish = result.prediction === 'bearish';
                  let recColor = 'bg-white/10 text-white border-white/20';
                  if (['strong_buy', 'buy'].includes(result.recommendation)) recColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                  else if (['sell', 'strong_sell'].includes(result.recommendation)) recColor = 'bg-red-500/20 text-red-400 border-red-500/30';

                  return (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                      <Card className="bg-white/[0.02] border border-white/10 rounded-none">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-2xl font-light text-white">{result.ticker}</span>
                                <Badge className={`${recColor} rounded-none uppercase text-[10px] py-1 px-2 font-bold tracking-wider`}>
                                  {result.recommendation?.replace('_', ' ')}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {isBullish ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : isBearish ? <TrendingDown className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-white/40" />}
                                  <span className={`text-xs font-medium uppercase ${isBullish ? 'text-emerald-400' : isBearish ? 'text-red-400' : 'text-white/40'}`}>
                                    {result.prediction}
                                  </span>
                                </div>
                                {result.isSimulated && (
                                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 rounded-none text-[10px] py-1 font-bold">
                                    ⚠️ SIMULATED (NO API KEY)
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-white/50">{result.companyName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isInWatchlist(result.ticker) ? (
                                <Button
                                  onClick={() => addToWatchlist(result)}
                                  variant="outline"
                                  className="border-white/10 text-white/70 hover:bg-white/5 rounded-none cursor-pointer h-9 gap-1.5 text-xs"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Watch
                                </Button>
                              ) : (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-none text-[10px] py-1">
                                  ✓ Watching
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* Key Metrics Row */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white/[0.03] border border-white/5 p-4">
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Current Price</p>
                              <p className="text-lg font-light text-white">{convertAndFormat(result.currentPrice)}</p>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 p-4">
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Target Price</p>
                              <p className={`text-lg font-light ${result.targetPrice > result.currentPrice ? 'text-emerald-400' : 'text-red-400'}`}>
                                {convertAndFormat(result.targetPrice)}
                              </p>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 p-4">
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Confidence</p>
                              <p className="text-lg font-light text-white">{result.confidence}%</p>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 p-4">
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Timeframe</p>
                              <p className="text-lg font-light text-white">{result.timeframe || '6-12 mo'}</p>
                            </div>
                          </div>

                          {/* Summary */}
                          <div>
                            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">AI Summary</p>
                            <p className="text-sm text-white/70 leading-relaxed">{result.summary}</p>
                          </div>

                          {/* Pros & Cons */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <p className="text-xs text-emerald-400/60 uppercase tracking-wider flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" /> Strengths
                              </p>
                              <div className="space-y-1.5">
                                {(result.pros || []).map((p, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                                    <span className="text-emerald-400 mt-0.5">+</span>
                                    <span>{p}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs text-red-400/60 uppercase tracking-wider flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5" /> Risks
                              </p>
                              <div className="space-y-1.5">
                                {(result.cons || []).map((c, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                                    <span className="text-red-400 mt-0.5">−</span>
                                    <span>{c}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })()}

                {/* Empty state */}
                {!searchResult && !viewingWatchItem && !searchLoading && !searchError && (
                  <Card className="bg-white/[0.02] border border-white/10 rounded-none">
                    <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-3">
                      <Brain className="w-12 h-12 text-white/10 stroke-1" />
                      <p className="text-sm text-white/40">Enter a stock ticker above and click <strong className="text-white/60">Analyze</strong> to get a real-time AI-powered investment analysis.</p>
                      <p className="text-xs text-white/20">Results are saved to your Watchlist for easy reference.</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Watchlist Sidebar */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Watchlist
                  </h3>
                  <span className="text-[10px] text-white/30">{watchlist.length} saved</span>
                </div>

                {watchlist.length === 0 ? (
                  <Card className="bg-white/[0.02] border border-white/10 rounded-none">
                    <CardContent className="p-8 text-center">
                      <Eye className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/30">Analyzed stocks you save will appear here.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <div className="space-y-2">
                      {watchlist.map((item) => {
                        let borderColor = 'border-white/10';
                        if (['strong_buy', 'buy'].includes(item.recommendation)) borderColor = 'border-emerald-500/20';
                        else if (['sell', 'strong_sell'].includes(item.recommendation)) borderColor = 'border-red-500/20';
                        const isActive = viewingWatchItem?.ticker === item.ticker;

                        return (
                          <div
                            key={item.ticker}
                            className={`bg-white/[0.02] border ${isActive ? 'border-white/30 bg-white/[0.05]' : borderColor} rounded-none p-4 cursor-pointer hover:bg-white/[0.04] transition-colors group`}
                            onClick={() => { setViewingWatchItem(item); setSearchResult(null); }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-white">{item.ticker}</span>
                                  <Badge className={`rounded-none uppercase text-[9px] py-0.5 font-bold tracking-wider ${
                                    ['strong_buy', 'buy'].includes(item.recommendation) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                    ['sell', 'strong_sell'].includes(item.recommendation) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                    'bg-white/10 text-white/60 border-white/20'
                                  }`}>
                                    {item.recommendation?.replace('_', ' ')}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-white/30">
                                  {convertAndFormat(item.currentPrice)} · {item.confidence}% confidence
                                </p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.ticker); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-white/20 hover:text-red-400 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default AIAnalysisScreen;
