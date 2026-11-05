// Thuis/Werk instellen: zoekveld (PandaOS-toetsenbord) met adressen van PDOK. Gebruikt in Instellingen > Navigatie.
import React, { useEffect, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { useUIStore, type SavedPlace } from '../../store/uiStore';
import { useT } from '../../i18n';

// Zelfde vraag als de kaart (Map.tsx): coördinaten als lengte/breedte (CRS84)
const PDOK_SEARCH = 'https://api.pdok.nl/kadaster/location-api/v1/search'
  + '?adres[relevance]=1&adres[version]=1&woonplaats[relevance]=0.5&woonplaats[version]=1'
  + '&limit=6&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84&q=';

export const searchAddresses = async (query: string): Promise<SavedPlace[]> => {
  const response = await fetch(PDOK_SEARCH + encodeURIComponent(query));
  const data = await response.json();
  return (data.features || []).slice(0, 6).map((f: any) => ({
    name: f.properties.display_name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
  }));
};

const PlacePicker: React.FC<{ onPick: (place: SavedPlace) => void; onCancel: () => void; compact?: boolean }> = ({ onPick, onCancel, compact = false }) => {
  const t = useT();
  const { keyboardValue, openKeyboard, closeKeyboard } = useUIStore();
  const [results, setResults] = useState<SavedPlace[]>([]);

  useEffect(() => { openKeyboard(''); return () => closeKeyboard(); }, [openKeyboard, closeKeyboard]);
  useEffect(() => {
    if (keyboardValue.trim().length < 3) { setResults([]); return; }
    const timer = window.setTimeout(() => { searchAddresses(keyboardValue).then(setResults).catch(() => setResults([])); }, 400);
    return () => window.clearTimeout(timer);
  }, [keyboardValue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={18} />
        <input className="tsl-input" style={{ flex: 1 }} readOnly value={keyboardValue} placeholder={t('Search address')}
          onFocus={() => openKeyboard(keyboardValue)} />
        {!compact && <button className="tsl-btn is-small" onClick={() => { closeKeyboard(); onCancel(); }}>{t('Cancel')}</button>}
      </div>
      <div className="tsl-list">
        {results.map((r, i) => (
          <div key={i} className="tsl-list-row" style={{ cursor: 'pointer', padding: compact ? '6px 0' : undefined }} onClick={() => { closeKeyboard(); onPick(r); }}>
            <MapPin size={18} />
            <div className="tsl-list-text">
              <span className="tsl-field-text">{r.name.split(',')[0]}</span>
              <small className="tsl-hint">{r.name.split(',').slice(1).join(',').trim()}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Pop-up "Thuisadres/Werkadres instellen": typen = adressen zoeken (PDOK), tik op een adres = opslaan
export const PlacePickerModal: React.FC<{ place: 'home' | 'work'; onClose: () => void }> = ({ place, onClose }) => {
  const t = useT();
  const { updateNavigationSetting, screenMode } = useUIStore();
  const dark = screenMode !== 'light';
  return (
    // Bovenin het scherm en boven het PandaOS-toetsenbord (dat de onderste helft bedekt)
    <div className="tsl-modal-backdrop" onClick={onClose} style={{ zIndex: 1100, alignItems: 'flex-start', paddingTop: 8 }}>
      <div className={`tsl-modal tsl-ui ${dark ? 'dark-mode' : ''}`}
        style={{ width: 620, maxHeight: 158, overflowY: 'auto', padding: '10px 16px', gap: 6 }}
        onClick={(e) => e.stopPropagation()}>
        <button className="tsl-modal-close" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        <span className="tsl-modal-title" style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>{t(place === 'home' ? 'Set home address' : 'Set work address')}</span>
        <PlacePicker compact onCancel={onClose} onPick={(p) => { updateNavigationSetting(place, p); onClose(); }} />
      </div>
    </div>
  );
};

export default PlacePicker;
