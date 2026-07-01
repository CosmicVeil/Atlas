import { createContext, useContext, useState } from 'react';

const CurrencyContext = createContext();

const EXCHANGE_RATES = {
  USD: { rate: 1.0, symbol: '$' },
  EUR: { rate: 0.92, symbol: '€' },
  GBP: { rate: 0.78, symbol: '£' },
  INR: { rate: 83.5, symbol: '₹' },
  JPY: { rate: 161.0, symbol: '¥' },
  CAD: { rate: 1.37, symbol: 'C$' },
  AUD: { rate: 1.50, symbol: 'A$' }
};

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    return localStorage.getItem('atlas_currency') || 'USD';
  });

  const setCurrency = (curr) => {
    if (EXCHANGE_RATES[curr]) {
      setCurrencyState(curr);
      localStorage.setItem('atlas_currency', curr);
    }
  };

  const convertAndFormat = (amountInUSD, decimals = 2) => {
    if (amountInUSD === undefined || amountInUSD === null || isNaN(amountInUSD)) {
      return '';
    }
    const info = EXCHANGE_RATES[currency];
    const converted = amountInUSD * info.rate;
    
    return `${info.symbol}${converted.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`;
  };

  const getCurrencySymbol = () => {
    return EXCHANGE_RATES[currency].symbol;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convertAndFormat, getCurrencySymbol, EXCHANGE_RATES }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
