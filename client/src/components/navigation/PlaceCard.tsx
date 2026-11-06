// Kaartje van een plek op de kaart (tik op een plek, of (i) bij zoeken op soort), zoals de routekaart linksonder:
// naam, soort, adres, afstand en openingstijden (als OpenStreetMap ze heeft). Knoppen: Navigeren en sluiten.
// Geen foto's of recensies (geen Google).
import React from 'react';
import { X, Clock, MapPin, Phone } from 'lucide-react';
import { useT } from '../../i18n';
import { PLACE_ICONS, PLACE_KINDS, placeAddress, type Place } from './MapPlaces';

interface Props {
  place: Place;
  distance: string; // al opgemaakt ("850 m", "3.2 km")
  onNavigate: () => void;
  onClose: () => void;
}

const PlaceCard: React.FC<Props> = ({ place, distance, onNavigate, onClose }) => {
  const t = useT();
  const color = PLACE_KINDS.find((k) => k.id === place.kind)?.color;
  const address = placeAddress(place);
  // OpenStreetMap: opening_hours ("Mo-Fr 07:00-22:00; Sa,Su 08:00-22:00"), "24/7" als altijd open
  const hours = place.tags.opening_hours;
  const phone = place.tags.phone || place.tags['contact:phone'];
  const brand = place.tags.brand && place.tags.brand !== place.name ? place.tags.brand : '';

  return (
    <div className="tsl-place-card">
      <div className="place-top">
        <span className="map-place" style={{ background: color }} dangerouslySetInnerHTML={{ __html: PLACE_ICONS[place.kind] }} />
        <div className="place-main">
          <span className="place-name">{place.name || t(place.label)}</span>
          <span className="place-kind">{[t(place.label), brand].filter(Boolean).join(' · ')}</span>
        </div>
        <button className="place-close" aria-label={t('Close')} onClick={onClose}><X size={20} /></button>
      </div>
      <div className="place-info">
        <div className="place-row"><MapPin size={16} /><span>{[distance, address].filter(Boolean).join(' · ')}</span></div>
        {hours && <div className="place-row"><Clock size={16} /><span>{hours === '24/7' ? t('Open 24 hours') : hours}</span></div>}
        {phone && <div className="place-row"><Phone size={16} /><span>{phone}</span></div>}
      </div>
      <div className="place-actions">
        <button className="primary" onClick={onNavigate}>{t('Navigate')}</button>
      </div>
    </div>
  );
};

export default PlaceCard;
