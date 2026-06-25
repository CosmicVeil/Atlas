import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { TrendingUp, TrendingDown, Star, AlertTriangle, ArrowUpRight, ArrowDownRight, Calendar, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";

// Mock data
const mockRecommendedStocks = [
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    price: 892.45,
    change: 12.34,
    changePercent: 1.4,
    recommendation: "strong_buy",
    confidence: 92,
    reasoning: "Strong AI/GPU market leadership with expanding data center business. Recent earnings beat expectations by 15%, and forward guidance suggests continued growth in H100/H200 chip demand.",
    keyPoints: [
      "Market leader in AI chip technology",
      "Data center revenue up 217% YoY",
      "Strong partnership ecosystem",
      "Healthy profit margins above 70%"
    ],
    riskLevel: "medium",
    potentialReturn: 35.2
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    price: 425.80,
    change: 8.20,
    changePercent: 2.0,
    recommendation: "strong_buy",
    confidence: 89,
    reasoning: "Azure cloud growth accelerating with AI integration. Office 365 Copilot adoption exceeding expectations, creating new revenue streams. Strong balance sheet provides stability.",
    keyPoints: [
      "Azure cloud revenue up 29% YoY",
      "AI Copilot driving subscription growth",
      "Diversified revenue streams",
      "Strong free cash flow generation"
    ],
    riskLevel: "low",
    potentialReturn: 28.5
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    price: 178.32,
    change: 5.67,
    changePercent: 3.3,
    recommendation: "buy",
    confidence: 85,
    reasoning: "Gaining market share in both CPU and GPU markets. MI300 AI accelerator showing strong early adoption. Server processor business remains robust.",
    keyPoints: [
      "MI300 AI chip competitive positioning",
      "Data center CPU market share gains",
      "Improved gross margins",
      "Strategic Xilinx integration paying off"
    ],
    riskLevel: "medium",
    potentialReturn: 42.0
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc.",
    price: 245.67,
    change: -2.34,
    changePercent: -0.9,
    recommendation: "buy",
    confidence: 78,
    reasoning: "Energy storage business growing rapidly, offsetting automotive margin pressure. FSD development progressing well. New model launches expected in 2024 will drive volume growth.",
    keyPoints: [
      "Energy storage deployments up 125%",
      "FSD subscription adoption increasing",
      "Manufacturing efficiency improvements",
      "Expanding global production capacity"
    ],
    riskLevel: "high",
    potentialReturn: 55.8
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    price: 156.89,
    change: 3.45,
    changePercent: 2.3,
    recommendation: "buy",
    confidence: 87,
    reasoning: "Search business remains dominant, while cloud division approaching profitability. AI investments positioning company well for future. Attractive valuation relative to peers.",
    keyPoints: [
      "Search ad revenue stable and growing",
      "Google Cloud approaching profitability",
      "Bard AI competitive positioning",
      "Strong balance sheet with $110B cash"
    ],
    riskLevel: "low",
    potentialReturn: 31.2
  }
];

const mockWorstStocks = [
  {
    ticker: "SNAP",
    name: "Snap Inc.",
    price: 12.34,
    change: -0.89,
    changePercent: -6.7,
    recommendation: "sell",
    confidence: 84,
    reasoning: "Continued user growth challenges in competitive social media landscape. Ad revenue declining as major advertisers shift budgets. AR strategy not gaining traction fast enough.",
    keyPoints: [
      "Daily active users declining",
      "Ad revenue down 12% YoY",
      "Increasing competition from TikTok/Instagram",
      "High operating costs relative to revenue"
    ],
    riskLevel: "high",
    potentialReturn: -25.4
  },
  {
    ticker: "RIVN",
    name: "Rivian Automotive",
    price: 18.45,
    change: -1.23,
    changePercent: -6.3,
    recommendation: "strong_sell",
    confidence: 88,
    reasoning: "Cash burn rate remains unsustainable. Production delays and quality issues persisting. Competitive pressure from established automakers intensifying.",
    keyPoints: [
      "Burning $1.5B cash per quarter",
      "Production targets consistently missed",
      "Limited charging infrastructure",
      "Intense competition in EV truck market"
    ],
    riskLevel: "high",
    potentialReturn: -42.1
  },
  {
    ticker: "COIN",
    name: "Coinbase Global",
    price: 156.78,
    change: -8.90,
    changePercent: -5.4,
    recommendation: "sell",
    confidence: 81,
    reasoning: "Regulatory uncertainty creating headwinds. Trading volumes declining in bear crypto market. Diversification efforts not offsetting core business weakness.",
    keyPoints: [
      "Trading volumes down 35% QoQ",
      "SEC regulatory scrutiny increasing",
      "Customer acquisition costs rising",
      "Crypto market sentiment negative"
    ],
    riskLevel: "high",
    potentialReturn: -18.7
  },
  {
    ticker: "ZM",
    name: "Zoom Video Communications",
    price: 67.89,
    change: -2.34,
    changePercent: -3.3,
    recommendation: "sell",
    confidence: 79,
    reasoning: "Post-pandemic demand normalization hurting growth. Enterprise competition from Microsoft Teams intensifying. Limited moat in commoditizing video conferencing market.",
    keyPoints: [
      "Revenue growth slowing to single digits",
      "Market share losses to Microsoft Teams",
      "Enterprise churn rates increasing",
      "Limited differentiation vs competitors"
    ],
    riskLevel: "medium",
    potentialReturn: -15.3
  },
  {
    ticker: "HOOD",
    name: "Robinhood Markets",
    price: 14.23,
    change: -0.67,
    changePercent: -4.5,
    recommendation: "strong_sell",
    confidence: 86,
    reasoning: "Trading activity declining as retail investor enthusiasm wanes. Payment for order flow under regulatory pressure. User engagement metrics deteriorating.",
    keyPoints: [
      "Monthly active users down 22%",
      "Trading volumes at 2-year lows",
      "PFOF revenue model at risk",
      "Increased regulatory compliance costs"
    ],
    riskLevel: "high",
    potentialReturn: -32.8
  }
];

function AIAnalysisScreen() {
  const [selectedTab, setSelectedTab] = useState("recommended");
  const [lastUpdated] = useState(new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }));

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
            <div className="text-2xl">${stock.price.toFixed(2)}</div>
            <div className={`flex items-center gap-1 justify-end ${stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stock.change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)</span>
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
            <Button variant="outline" className="gap-2 border-white/20 text-white bg-transparent hover:bg-white/5 cursor-pointer">
              <RefreshCw className="w-4 h-4" />
              Refresh Analysis
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Calendar className="w-4 h-4" />
            Last updated: {lastUpdated}
          </div>
          <p className="text-white/60">
            AI-powered analysis of the top 500 stocks, updated daily with intelligent model insights.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-white/5 border border-white/10 p-1 h-11">
            <TabsTrigger value="recommended" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <TrendingUp className="w-4 h-4" />
              Recommended Stocks
            </TabsTrigger>
            <TabsTrigger value="worst" className="gap-2 text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer">
              <TrendingDown className="w-4 h-4" />
              Stocks to Avoid
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">Top Recommended Stocks</h2>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  {mockRecommendedStocks.length} stocks analyzed
                </Badge>
              </div>
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="grid gap-4 pr-4">
                  {mockRecommendedStocks.map((stock) => (
                    <StockCard key={stock.ticker} stock={stock} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="worst" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-light">Stocks to Avoid</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                  {mockWorstStocks.length} stocks flagged
                </Badge>
              </div>
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="grid gap-4 pr-4">
                  {mockWorstStocks.map((stock) => (
                    <StockCard key={stock.ticker} stock={stock} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default AIAnalysisScreen;
