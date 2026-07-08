import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { getMarketWarnings } from '../api/news';
import { useAuth } from '../context/AuthContext';

function WarningCard({ warning, tone }) {
  const isPositive = tone === 'positive';
  const border = isPositive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5';
  const score = isPositive ? 'text-emerald-300 border-emerald-500/20' : 'text-red-300 border-red-500/20';

  return (
    <div className={`border ${border} p-5 bg-black`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-white text-lg font-light">{warning.symbol || 'Market'}</p>
          <p className="text-xs text-white/40">{warning.company_name || warning.headline}</p>
        </div>
        <span className={`text-xs px-2 py-1 border ${score}`}>
          {warning.impact_score ?? 0}/100
        </span>
      </div>
      <p className="text-sm text-white/75 leading-relaxed mb-3">{warning.reasoning}</p>
      <p className="text-xs text-white/40 leading-relaxed">{warning.accepted_reason}</p>
      {warning.article_url && (
        <a
          href={warning.article_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 mt-4 text-xs text-white/55 hover:text-white transition-colors"
        >
          Source <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function MarketNews() {
  const { token } = useAuth();
  const [warnings, setWarnings] = useState({ negative: [], positive: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadWarnings() {
    setLoading(true);
    setError('');
    try {
      const data = await getMarketWarnings(token);
      if (data.error) {
        setError(data.error);
      } else {
        setWarnings({
          negative: data.negative || [],
          positive: data.positive || [],
        });
      }
    } catch (err) {
      setError('Unable to load market warnings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadWarnings();
    const timer = setInterval(loadWarnings, 60000);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <div className="min-h-screen bg-black text-white pt-24">
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-5xl font-light tracking-tight">Market News</h1>
            <p className="text-white/40 mt-3 text-sm">
              AI-accepted warnings from the daily news stream.
            </p>
          </div>
          <motion.button
            onClick={loadWarnings}
            className="px-5 py-3 border border-white/20 bg-transparent text-white text-sm tracking-wide hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </motion.button>
        </div>

        {error && (
          <div className="border border-red-500/20 bg-red-500/5 p-4 mb-8 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="border border-white/5 bg-black p-6">
            <div className="flex items-center gap-3 mb-5">
              <AlertTriangle className="w-5 h-5 text-red-300" strokeWidth={1.5} />
              <h2 className="text-sm text-white/70 tracking-wider uppercase">Negative Warnings</h2>
            </div>
            {loading && warnings.negative.length === 0 ? (
              <div className="flex items-center gap-3 text-white/40 text-sm py-6">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading risk warnings...
              </div>
            ) : warnings.negative.length === 0 ? (
              <p className="text-white/40 text-sm py-4">No accepted negative warnings yet.</p>
            ) : (
              <div className="space-y-4">
                {warnings.negative.map((warning) => (
                  <WarningCard key={warning.id} warning={warning} tone="negative" />
                ))}
              </div>
            )}
          </section>

          <section className="border border-white/5 bg-black p-6">
            <div className="flex items-center gap-3 mb-5">
              <Sparkles className="w-5 h-5 text-emerald-300" strokeWidth={1.5} />
              <h2 className="text-sm text-white/70 tracking-wider uppercase">Positive Warnings</h2>
            </div>
            {loading && warnings.positive.length === 0 ? (
              <div className="flex items-center gap-3 text-white/40 text-sm py-6">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading positive signals...
              </div>
            ) : warnings.positive.length === 0 ? (
              <p className="text-white/40 text-sm py-4">No accepted positive warnings yet.</p>
            ) : (
              <div className="space-y-4">
                {warnings.positive.map((warning) => (
                  <WarningCard key={warning.id} warning={warning} tone="positive" />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default MarketNews;
