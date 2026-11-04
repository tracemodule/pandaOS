import React from 'react';
import { useUIStore } from '../store/uiStore';
import { getEffectiveTheme } from '../settings';
import { useT } from '../i18n';
import './_system-notification.scss';

// Dynamisch icoon op basis van de melding
const NotificationIcon = ({ label }: { label: string }) => {
  // Tesla-style Airbag icon (default)
  if (label === "PASSENGER") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="10" r="4" fill="#FF9F05" />
        <path d="M4.5 8.5L7.5 11.5M7.5 8.5L4.5 11.5" stroke="#333" strokeWidth="1" />
        <circle cx="16" cy="6" r="2.5" fill="#FF9F05" />
        <path d="M13 9C13 9 13.5 17 16.5 17C19.5 17 20 9 20 9H13Z" fill="#FF9F05" />
        <path d="M10 19L14 15L18 19" stroke="#FF9F05" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  // Seatbelt icon
  if (label.includes("BELT")) {
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#FF9F05">
            <path d="M7 2v20h10V2H7zm8 18H9V4h6v16zM10 9h4v2h-4V9zm0 4h4v2h-4v-2z" />
        </svg>
      );
  }
  // Bandenspanning / Systeem / Batterij (Standaard waarschuwing)
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 20h20L12 2z" stroke="#FF9F05" strokeWidth="2" strokeLinejoin="round"/>
        <rect x="11.5" y="10" width="1" height="5" fill="#FF9F05"/>
        <circle cx="12" cy="17" r="0.5" fill="#FF9F05"/>
    </svg>
  );
};

// Pop-up bovenaan in het midden (Tesla UI Kit-kaart), los van de statusbalk. Verdwijnt na 4 s (uiStore.showNotification).
const SystemNotification: React.FC = () => {
    const { notification, screenMode, vehicleLightsOn } = useUIStore();
    const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
    const t = useT(); // tekst zonder vertaling blijft zoals hij is

    if (!notification.visible) return null;

    return (
        <div className={`tsl-notification tsl-ui ${isDarkMode ? 'dark-mode' : ''} ${notification.type === 'alert' ? 'is-alert' : ''}`} role="status">
            <NotificationIcon label={notification.label || "SYSTEM"} />
            <div className="tsl-notification-text">
                <span className="tsl-overline">{t(notification.label || "SYSTEM")}</span>
                <span className="tsl-field-text">{t(notification.message)}</span>
            </div>
        </div>
    );
};

export default SystemNotification;