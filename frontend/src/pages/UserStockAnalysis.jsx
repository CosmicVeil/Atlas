import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { getStockDetail, getAllStocks } from "../api/stockData";
import {
  Search,
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Activity,
  Building2,
  Hash,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutList,
  Table2
} from "lucide-react";

const TABS = [
  { key: "search", label: "Search", icon: Search },
  { key: "browse", label: "Browse", icon: LayoutList },
];

function UserStockAnalysis() {
  const { token } = useAuth();
  const { currency, EXCHANGE_RATES } = useCurrency();
  const [activeTab, setActiveTab] = useState("search");

  /* Search tab state */
  const [ticker, setTicker] = useState("");
  const [stock, setStock] = useState(null);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState("");

  /* Browse tab state */
  const [allStocks, setAllStocks] = useState([]);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [filterText, setFilterText] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "symbol", direction: "asc" });

  // Dynamic currency formatter helper
  const formatVal = (val, isRawNumber = false) => {
    if (val === undefined || val === null || val === "None" || val === "") return "—";
    const num = parseFloat(val);
    if (isNaN(num)) return val;

    if (isRawNumber) {
      return num.toLocaleString();
    }

    // Currency values
    const rate = EXCHANGE_RATES[currency].rate;
    const symbol = EXCHANGE_RATES[currency].symbol;
    const converted = num * rate;

    if (converted >= 1e9) {
      return `${symbol}${(converted / 1e9).toFixed(2)}B`;
    }
    if (converted >= 1e6) {
      return `${symbol}${(converted / 1e6).toFixed(2)}M`;
    }
    return `${symbol}${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /* ── Search tab handlers ── */
  const handleSearch = async () => {
    if (!ticker.trim()) {
      setSearchError("Please enter a stock ticker symbol");
      return;
    }
    setSearchError("");
    setIsLoadingSearch(true);
    setStock(null);

    try {
      const data = await getStockDetail(ticker.trim(), token);
      if (data.error) {
        setSearchError(data.error);
      } else {
        setStock(data);
      }
    } catch (err) {
      setSearchError("Failed to fetch stock data. Please try again.");
    } finally {
      setIsLoadingSearch(false);
    }
  };

  /* ── Browse tab handlers ── */
  const fetchAllStocks = async () => {
    setIsLoadingBrowse(true);
    setBrowseError("");
    try {
      const res = await getAllStocks(token);
      if (res.stocks) {
        setAllStocks(res.stocks);
      } else {
        setBrowseError("No stock data available.");
      }
    } catch (err) {
      setBrowseError("Failed to load stock list.");
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  useEffect(() => {
    if (activeTab === "browse") {
      fetchAllStocks();
    }
  }, [activeTab]);

  /* ── Sorting & Filtering ── */
  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filteredAndSorted = useMemo(() => {
    let data = [...allStocks];

    // Filter
    if (filterText.trim()) {
      const q = filterText.toUpperCase();
      data = data.filter(
        (s) =>
          (s.symbol || "").toUpperCase().includes(q) ||
          (s.name || "").toUpperCase().includes(q) ||
          (s.sector || "").toUpperCase().includes(q) ||
          (s.industry || "").toUpperCase().includes(q)
      );
    }

    // Sort
    data.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      const bothNumeric = !isNaN(aNum) && !isNaN(bNum) && aVal !== "" && bVal !== "";

      let cmp = 0;
      if (bothNumeric) {
        cmp = aNum - bNum;
      } else {
        cmp = String(aVal || "").localeCompare(String(bVal || ""));
      }
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });

    return data;
  }, [allStocks, filterText, sortConfig]);

  /* ── column definitions for table ── */
  const columns = [
    { key: "symbol", label: "Symbol", width: "w-20" },
    { key: "name", label: "Name", width: "w-48" },
    { key: "price", label: "Price", width: "w-24" },
    { key: "change_percent", label: "Change %", width: "w-24" },
    { key: "volume", label: "Volume", width: "w-24" },
    { key: "sector", label: "Sector", width: "w-32" },
    { key: "market_cap", label: "Market Cap", width: "w-28" },
    { key: "pe_ratio", label: "P/E", width: "w-20" },
    { key: "eps", label: "EPS", width: "w-20" },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8 pt-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-light tracking-tight mb-2">Stock Data</h1>
          <p className="text-white/40 text-sm">
            Look up any publicly traded company by ticker symbol.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium tracking-wide transition-colors border-b-2 ${
                  isActive
                    ? "border-white text-white"
                    : "border-transparent text-white/40 hover:text-white/70"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ───────────── Search Tab ───────────── */}
        {activeTab === "search" && (
          <div className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-light text-lg">
                  <Search className="w-5 h-5 text-white" />
                  Search Ticker
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input
                    placeholder="e.g. AAPL, TSLA, IBM"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="text-lg bg-white/5 border-white/10 text-white focus:outline-none focus:border-white/30"
                    disabled={isLoadingSearch}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={isLoadingSearch}
                    className="gap-2 px-8 bg-white text-black hover:bg-white/90 cursor-pointer font-medium"
                  >
                    {isLoadingSearch ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Lookup
                      </>
                    )}
                  </Button>
                </div>
                {searchError && (
                  <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-950/20 border border-red-500/20 p-3 rounded-md">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {searchError}
                  </div>
                )}
              </CardContent>
            </Card>

            {stock && (
              <div className="space-y-6">
                {/* Detail Card */}
                <Card className="bg-card border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <Badge variant="outline" className="text-white border-white/20 font-mono tracking-wider">
                            {stock.symbol}
                          </Badge>
                          <span className="text-white/30 text-sm">{stock.sector}</span>
                        </div>
                        <h2 className="text-3xl font-light">{stock.name || stock.symbol}</h2>
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-light">
                          {formatVal(stock.price)}
                        </div>
                        <div className={`text-sm font-medium flex items-center justify-end gap-1 mt-1 ${parseFloat(stock.change || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {parseFloat(stock.change || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {parseFloat(stock.change || 0) >= 0 ? '+' : ''}{formatVal(stock.change)} ({stock.change_percent || '0%'})
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-white/50 text-sm leading-relaxed">
                      {stock.description || "No description available."}
                    </p>
                  </CardContent>
                </Card>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard icon={DollarSign} label="Market Cap" value={formatVal(stock.market_cap)} />
                  <MetricCard icon={Activity} label="P/E Ratio" value={stock.pe_ratio || "—"} />
                  <MetricCard icon={BarChart3} label="Volume" value={formatVal(stock.volume, true)} />
                  <MetricCard icon={Hash} label="EPS" value={stock.eps || "—"} />
                  <MetricCard icon={TrendingUp} label="52-Week High" value={formatVal(stock.week_52_high)} />
                  <MetricCard icon={TrendingDown} label="52-Week Low" value={formatVal(stock.week_52_low)} />
                  <MetricCard icon={DollarSign} label="Dividend Yield" value={stock.dividend_yield ? `${(parseFloat(stock.dividend_yield) * 100).toFixed(2)}%` : "—"} />
                  <MetricCard icon={Building2} label="Industry" value={stock.industry || "—"} />
                </div>
              </div>
            )}

            {!stock && !isLoadingSearch && (
              <div className="text-center py-20 text-white/30 text-sm">
                Enter a ticker above to get started.
              </div>
            )}
          </div>
        )}

        {/* ───────────── Browse Tab ───────────── */}
        {activeTab === "browse" && (
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input
                  placeholder="Filter by symbol, name, sector, or industry…"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <Button
                onClick={fetchAllStocks}
                disabled={isLoadingBrowse}
                className="gap-2 bg-white text-black hover:bg-white/90 cursor-pointer font-medium"
              >
                {isLoadingBrowse ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Table2 className="w-4 h-4" />
                )}
                Refresh
              </Button>
            </div>

            {/* Table */}
            <div className="border border-white/10 rounded-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`text-left px-4 py-3 text-xs uppercase tracking-wider text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors select-none ${col.width}`}
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {sortConfig.key === col.key ? (
                              sortConfig.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3" />
                              ) : (
                                <ArrowDown className="w-3 h-3" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredAndSorted.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="px-4 py-12 text-center text-white/30">
                          {isLoadingBrowse ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading stocks…
                            </div>
                          ) : browseError ? (
                            <span className="text-red-400">{browseError}</span>
                          ) : (
                            "No stocks match your filter."
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredAndSorted.map((s, idx) => {
                        const price = parseFloat(s.price || 0);
                        const change = parseFloat(s.change || 0);
                        const changePct = s.change_percent || "0%";
                        return (
                          <tr
                            key={idx}
                            className="hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="font-mono text-white border-white/20">
                                {s.symbol}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-white/80 max-w-xs truncate">
                              {s.name || "—"}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {formatVal(s.price)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {changePct}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-white/60">
                              {formatVal(s.volume, true)}
                            </td>
                            <td className="px-4 py-3 text-white/60">{s.sector || "—"}</td>
                            <td className="px-4 py-3 text-white/60">
                              {formatVal(s.market_cap)}
                            </td>
                            <td className="px-4 py-3 font-mono text-white/60">
                              {s.pe_ratio || "—"}
                            </td>
                            <td className="px-4 py-3 font-mono text-white/60">
                              {s.eps || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Count */}
            <div className="text-white/30 text-xs text-right">
              {filteredAndSorted.length} of {allStocks.length} stocks shown
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────── subcomponents ────────────────── */
function MetricCard({ icon: Icon, label, value }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider">
          <Icon className="w-4 h-4" />
          {label}
        </div>
        <div className="text-xl font-light text-white">{value}</div>
      </CardContent>
    </Card>
  );
}

export default UserStockAnalysis;
