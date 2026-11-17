import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { BANNER_MESSAGE, bannerTickers } from './predictionBanner.js';

export default function PredictionBanner({ symbols = [], onReload, onDismiss, reloading = false }) {
  const tickers = bannerTickers(symbols);
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 border border-white/10 bg-white/[0.02] rounded-none p-4 text-sm text-white/80">
      <Sparkles className="w-4 h-4 text-sky-400" aria-hidden="true" />
      <p className="flex-1">{BANNER_MESSAGE}{tickers.length > 0 && <span className="ml-2 text-white/50">{tickers.join(', ')}</span>}</p>
      <Button variant="outline" onClick={onReload} disabled={reloading} className="gap-2 rounded-none border-white/20 text-white bg-transparent hover:bg-white/5 cursor-pointer">
        {reloading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="w-4 h-4" />}
        Reload
      </Button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="p-2 text-white/50 hover:text-white cursor-pointer">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
