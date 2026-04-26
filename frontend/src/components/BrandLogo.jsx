import React from 'react';
import dangoteLogo from '../assets/dangote.png';

export default function BrandLogo({ compact = false, className = '', showTagline = false }) {
  return (
    <div className={`brand-lockup ${compact ? 'compact' : ''} ${className}`.trim()}>
      <img className="brand-logo-mark" src={dangoteLogo} alt="Dangote" />
      <div className="brand-copy">
        <div className="brand-wordmark">Dangote</div>
        <div className="brand-product-name">Canteen Management Platform</div>
        {showTagline ? <div className="brand-credit">Developed by Emocom Technologies</div> : null}
      </div>
    </div>
  );
}