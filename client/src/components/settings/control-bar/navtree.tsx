// src/components/settings/control-bar/navtree.tsx
import React from 'react';
import { useUIStore } from '../../../store/uiStore';
import { getEffectiveTheme } from '../../../settings';
import { useT } from '../../../i18n';
import { Car, Monitor, Map, ShieldCheck, Wrench, Info, Wifi, Bluetooth, LayoutGrid, SlidersHorizontal, KeyRound } from 'lucide-react';
import './_navtree.scss';

const NavTree: React.FC = () => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const screenMode = useUIStore((state) => state.screenMode);
  const vehicleLightsOn = useUIStore((state) => state.vehicleLightsOn);
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const t = useT();

  // Lights en Schedule zijn weg: koplampen zijn niet vanuit de radio te bedienen, laadplanning is iets van Tesla.
  // Audio staat niet hier: de equalizer zit (zoals bij Tesla) in Music, achter de schuifregelaarknop.
  const menuItems = [
    { id: 'Vehicle', icon: <Car />, label: 'Vehicle' },
    // Geavanceerd: CAN-bus, gegevens van je eigen auto en andere instellingen voor de radio
    { id: 'Advanced', icon: <SlidersHorizontal />, label: 'Advanced' },
    { id: 'Display', icon: <Monitor />, label: 'Display' },
    { id: 'Trips', icon: <Map />, label: 'Trips' },
    { id: 'Navigation', icon: <Map />, label: 'Navigation' },
    { id: 'Safety', icon: <ShieldCheck />, label: 'Safety' },
    { id: 'Maintenance', icon: <Wrench />, label: 'Maintenance' },
    { id: 'Apps', icon: <LayoutGrid />, label: 'Apps' },
    // Rechten: alle rechten van PandaOS, het startscherm, toetsenbord en paneel
    { id: 'Permissions', icon: <KeyRound />, label: 'Permissions' },
    { id: 'Software', icon: <Info />, label: 'Software' },
    { id: 'Wi-Fi', icon: <Wifi />, label: 'Wi-Fi' },
    { id: 'Bluetooth', icon: <Bluetooth />, label: 'Bluetooth' },
  ];

  return (
    <aside className={`tsl-navtree${isDarkMode ? ' dark-mode' : ''}`}>
      <div className="nav-scroll-container">
        <ul>
          {menuItems.map((item) => (
            <li 
              key={item.id} 
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{t(item.label)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

export default NavTree;