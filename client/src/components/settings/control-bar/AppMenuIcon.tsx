import React from 'react';

// Knop van het app-menu in de dock: vier vierkantjes die bij openen naar het midden schuiven en overgaan in een
// kruisje (sluiten); bij sluiten weer terug. Eén SVG zonder kader, ongeveer zo groot als de app-iconen in de dock.
// Animatie met CSS (zie .dock-menu-icon in _control-bar.scss), zodat het ook op de WebView van de radio vloeiend is.
const AppMenuIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg className={`dock-menu-icon ${open ? 'is-open' : ''}`} viewBox="0 0 30 30" aria-hidden="true">
    <g className="squares">
      <rect className="sq sq-tl" x="4" y="4" width="9" height="9" rx="2.4" />
      <rect className="sq sq-tr" x="17" y="4" width="9" height="9" rx="2.4" />
      <rect className="sq sq-bl" x="4" y="17" width="9" height="9" rx="2.4" />
      <rect className="sq sq-br" x="17" y="17" width="9" height="9" rx="2.4" />
    </g>
    <g className="cross">
      <path className="bar bar-a" d="M7 7 L23 23" />
      <path className="bar bar-b" d="M23 7 L7 23" />
    </g>
  </svg>
);

export default AppMenuIcon;
