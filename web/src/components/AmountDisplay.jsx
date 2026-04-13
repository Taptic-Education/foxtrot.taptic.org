import React, { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../lib/utils';

export default function AmountDisplay({ amount, currency = 'ZAR', style = {} }) {
  const [displayed, setDisplayed] = useState(0);
  const target = parseFloat(amount) || 0;
  const frameRef = useRef(null);
  const startRef = useRef(null);
  const duration = 800;

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    startRef.current = null;
    const from = displayed;

    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (target - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  const symbols = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency;
  const formatted = `${symbol}${displayed.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <span className="amount" style={style}>
      {formatted}
    </span>
  );
}
