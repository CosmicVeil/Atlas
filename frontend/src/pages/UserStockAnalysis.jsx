import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  BarChart3,
  Clock
} from "lucide-react";

// Mock function - in production this would call Claude API
const analyzeStock = async (ticker) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Mock data - replace with actual Claude API call
  const mockAnalyses = {
    "AAPL": {
      ticker: "AAPL",
      companyName: "Apple Inc.",
      currentPrice: 187.45,
      prediction: "bullish",
      recommendation: "buy",
      confidence: 82,
      targetPrice: 210.00,
      timeframe: "6-12 months",
      summary: "Apple maintains strong fundamentals with robust iPhone sales, growing services revenue, and a healthy ecosystem. The company's focus on AI integration and Vision Pro launch presents new growth opportunities. However, China market risks and regulatory pressures remain concerns.",
      pros: [
        "Services revenue growing at 15% YoY, providing recurring income stream",
        "iPhone 15 adoption strong despite mature smartphone market",
        "Vision Pro entering new spatial computing category with first-mover advantage",
        "Massive cash position ($162B) enables strategic flexibility",
        "Brand loyalty and ecosystem lock-in provide competitive moat",
        "AI integration across product line (Apple Intelligence) driving upgrade cycle"
      ],
      cons: [
        "Heavy dependence on iPhone sales (52% of revenue)",
        "China geopolitical risks affecting supply chain and market access",
        "EU regulatory pressure on App Store and USB-C mandate",
        "Limited near-term growth catalysts in core hardware",
        "Premium pricing strategy may face headwinds in economic downturn",
        "Vision Pro adoption uncertain at $3,500 price point"
      ],
      riskFactors: [
        "Regulatory scrutiny in multiple jurisdictions",
        "Supply chain concentration in China/Taiwan",
        "Market saturation in developed countries"
      ],
      analyzedAt: new Date().toISOString()
    },
    "TSLA": {
      ticker: "TSLA",
      companyName: "Tesla Inc.",
      currentPrice: 245.67,
      prediction: "neutral",
      recommendation: "hold",
      confidence: 68,
      targetPrice: 265.00,
      timeframe: "6-12 months",
      summary: "Tesla faces a transitional period with automotive margin pressure offset by energy storage growth. FSD development progressing but commercialization timeline uncertain. New models needed to reignite volume growth. High volatility expected.",
      pros: [
        "Energy storage deployments up 125% YoY, becoming significant revenue driver",
        "FSD Beta improving rapidly, potential for high-margin software revenue",
        "Supercharger network opening to competitors creates new revenue stream",
        "Manufacturing efficiency improvements reducing cost per vehicle",
        "Cybertruck production ramping, entering lucrative truck market",
        "Strong brand recognition and first-mover advantage in premium EVs"
      ],
      cons: [
        "Automotive gross margins declining (18.2% vs 25% historical)",
        "Increased competition from legacy automakers and Chinese EVs",
        "Price cuts eroding brand premium perception",
        "Regulatory investigation into Autopilot safety",
        "CEO attention divided across multiple ventures",
        "Valuation remains stretched relative to traditional automakers"
      ],
      riskFactors: [
        "Execution risk on new model launches",
        "Key person dependency on Elon Musk",
        "EV incentive policy changes"
      ],
      analyzedAt: new Date().toISOString()
    },
    "NVDA": {
      ticker: "NVDA",
      companyName: "NVIDIA Corporation",
      currentPrice: 892.45,
      prediction: "bullish",
      recommendation: "strong_buy",
      confidence: 91,
      targetPrice: 1150.00,
      timeframe: "6-12 months",
      summary: "NVIDIA is the clear winner in AI infrastructure with unmatched GPU technology and CUDA software moat. Data center growth remains exceptional with multi-year AI buildout cycle ahead. Near-term supply constraints limiting even stronger performance.",
      pros: [
        "Data center revenue up 217% YoY driven by AI chip demand",
        "H100/H200 chips have 6+ month wait times, indicating sustained demand",
        "CUDA software ecosystem creates massive switching costs",
        "Gross margins expanding to 70%+ on favorable product mix",
        "Diversified customer base across cloud providers and enterprises",
        "AI model training and inference markets both expanding rapidly",
        "New Blackwell architecture launching with performance improvements"
      ],
      cons: [
        "Valuation at 35x forward earnings, leaving little room for disappointment",
        "Customer concentration risk (Microsoft, Meta, Amazon)",
        "AMD and custom silicon (Google TPU, Amazon Trainium) increasing competition",
        "Export restrictions to China limiting addressable market",
        "Cyclical gaming and crypto mining revenue streams",
        "Supply chain dependencies on TSMC"
      ],
      riskFactors: [
        "AI bubble risk if enterprise ROI fails to materialize",
        "Geopolitical tensions affecting chip exports",
        "Technology disruption from quantum or alternative computing"
      ],
      analyzedAt: new Date().toISOString()
    }
  };

  const upperTicker = ticker.toUpperCase();

  if (mockAnalyses[upperTicker]) {
    return mockAnalyses[upperTicker];
  }

  // Generic response for tickers not in mock data
  return {
    ticker: upperTicker,
    companyName: `${upperTicker} Corporation`,
    currentPrice: 0,
    prediction: "neutral",
    recommendation: "hold",
    confidence: 50,
    targetPrice: 0,
    timeframe: "6-12 months",
    summary: `Analysis for ${upperTicker} is currently unavailable. Please try AAPL, TSLA, or NVDA for demo purposes.`,
    pros: ["Data not available"],
    cons: ["Data not available"],
    riskFactors: ["Data not available"],
    analyzedAt: new Date().toISOString()
  };
};

function UserStockAnalysis() {
  const [ticker, setTicker] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      setError("Please enter a stock ticker symbol");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await analyzeStock(ticker.trim());
      setAnalysis(result);
    } catch (err) {
      setError("Failed to analyze stock. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPredictionBadge = (prediction) => {
    const variants = {
      bullish: {
        icon: TrendingUp,
        color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        label: "BULLISH"
      },
      bearish: {
        icon: TrendingDown,
        color: "bg-red-500/20 text-red-400 border-red-500/30",
        label: "BEARISH"
      },
      neutral: {
        icon: BarChart3,
        color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        label: "NEUTRAL"
      }
    };

    const config = variants[prediction] || variants.neutral;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getRecommendationBadge = (recommendation) => {
    const variants = {
      strong_buy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      buy: "bg-green-500/20 text-green-400 border-green-500/30",
      hold: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      sell: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      strong_sell: "bg-red-500/20 text-red-400 border-red-500/30"
    };

    return (
      <Badge className={`${variants[recommendation]} border`}>
        {recommendation.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 pt-28">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-white/40 text-sm">
            Enter any stock ticker to get an AI-powered analysis with predictions, pros, cons, and recommendations
          </p>
        </div>

        {/* Search Input */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-light">
              <Brain className="w-5 h-5 text-white" />
              Analyze a Stock
            </CardTitle>
            <CardDescription className="text-white/40">
              Enter a stock ticker symbol (e.g., AAPL, TSLA, NVDA) for instant AI analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="Enter stock ticker (e.g., AAPL)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="text-lg bg-white/5 border-white/10 text-white focus:outline-none focus:border-white/30"
                disabled={isLoading}
              />
              <Button
                onClick={handleAnalyze}
                disabled={isLoading}
                className="gap-2 px-8 bg-white text-black hover:bg-white/90 cursor-pointer font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-black" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
            {error && (
              <Alert variant="destructive" className="mt-4 bg-red-950/20 text-red-400 border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Analysis Results */}
        {analysis && (
          <ScrollArea className="h-[calc(100vh-350px)]">
            <div className="space-y-4 pr-4">
              {/* Header Card */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-3xl font-light">{analysis.ticker}</CardTitle>
                        {getPredictionBadge(analysis.prediction)}
                        {getRecommendationBadge(analysis.recommendation)}
                      </div>
                      <CardDescription className="text-base text-white/40">
                        {analysis.companyName}
                      </CardDescription>
                    </div>
                    {analysis.currentPrice > 0 && (
                      <div className="text-right">
                        <div className="text-3xl font-light">${analysis.currentPrice.toFixed(2)}</div>
                        <div className="text-sm text-white/40">Current Price</div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <div className="text-sm text-white/40">Confidence</div>
                      <div className="text-2xl font-light">{analysis.confidence}%</div>
                    </div>
                    {analysis.targetPrice > 0 && (
                      <div className="space-y-1">
                        <div className="text-sm text-white/40">Target Price</div>
                        <div className="text-2xl font-light text-white">${analysis.targetPrice.toFixed(2)}</div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="text-sm text-white/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Timeframe
                      </div>
                      <div className="text-xl font-light">{analysis.timeframe}</div>
                    </div>
                  </div>

                  <Separator className="bg-white/5" />

                  {/* AI Summary */}
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-lg font-light">
                      <Brain className="w-5 h-5 text-white" />
                      AI Analysis Summary
                    </h3>
                    <p className="text-white/60 leading-relaxed text-sm">
                      {analysis.summary}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Pros Card */}
              <Card className="bg-card border-border border-l-4 border-l-emerald-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-400 font-light">
                    <CheckCircle2 className="w-5 h-5" />
                    Pros & Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {analysis.pros.map((pro, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-white/60 text-sm">{pro}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Cons Card */}
              <Card className="bg-card border-border border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-400 font-light">
                    <XCircle className="w-5 h-5" />
                    Cons & Risks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {analysis.cons.map((con, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-white/60 text-sm">{con}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Risk Factors */}
              <Card className="bg-card border-border border-l-4 border-l-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-400 font-light">
                    <AlertCircle className="w-5 h-5" />
                    Key Risk Factors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {analysis.riskFactors.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span className="text-white/60 text-sm">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Disclaimer */}
              <Alert className="bg-white/5 border border-white/10 text-white/60">
                <AlertCircle className="h-4 w-4 text-white" />
                <AlertDescription className="text-xs">
                  This analysis is generated by AI and should not be considered financial advice.
                  Always conduct your own research and consult with a financial advisor before making investment decisions.
                  Analysis generated at: {new Date(analysis.analyzedAt).toLocaleString()}
                </AlertDescription>
              </Alert>
            </div>
          </ScrollArea>
        )}

        {/* Empty State */}
        {!analysis && !isLoading && (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Brain className="w-16 h-16 text-white/40 mb-4" />
              <h3 className="text-xl mb-2 font-light">Ready to Analyze</h3>
              <p className="text-white/40 max-w-md text-sm">
                Enter a stock ticker above to get started with AI-powered analysis including predictions,
                pros, cons, and detailed recommendations.
              </p>
              <div className="flex gap-2 mt-6">
                <Badge variant="outline" className="cursor-pointer hover:bg-white/5 text-white/60 border-white/20 px-3 py-1" onClick={() => setTicker("AAPL")}>
                  Try AAPL
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-white/5 text-white/60 border-white/20 px-3 py-1" onClick={() => setTicker("TSLA")}>
                  Try TSLA
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-white/5 text-white/60 border-white/20 px-3 py-1" onClick={() => setTicker("NVDA")}>
                  Try NVDA
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default UserStockAnalysis;
