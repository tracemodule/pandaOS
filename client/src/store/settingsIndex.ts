// Zoekindex voor "Instellingen zoeken": per pagina (activeTab) de titels en instellingen die erop staan.
// Engelse sleutels; het zoeken vergelijkt ook met de vertaling (t()). Nieuwe instelling? Zet hem hier ook bij.
export const SETTINGS_INDEX: Record<string, string[]> = {
  Vehicle: ['Transmission', 'Paint', 'Colouriser', 'Paint Type', 'Wheels', 'Window Tint', 'Headlights', 'Mirrors', 'Grille',
    'Exhaust', 'Reverse camera', 'Graphics'],
  Advanced: ['My car', 'CAN bus', 'CAN box (box ↔ radio)', 'Vehicle protocol (car ↔ box)'],
  Display: ['Language', 'Appearance', 'Brightness', 'Night Filter', 'Text Size', 'Dock height', 'Time', 'Energy Display',
    'Distance', 'Temperature'],
  Trips: ['Trips', 'Distance', 'Top Speed'],
  Navigation: ['Navigation Volume', 'Avoid Motorways', 'Avoid Tolls', 'Avoid Ferries'],
  Safety: ['Speed Limit Warning', 'Warn Above Limit', 'Warning', 'Show Speed Limit'],
  Maintenance: ['Maintenance', 'Engine & Diagnostics'],
  Apps: ['Home screen', 'Keyboard', 'Panel', 'Android apps', 'Media info from Android apps', 'Open automatically'],
  Software: ['Software', 'Version', 'Software Update', 'WebView', 'Diagnostics', 'Report a problem', 'Name Your Vehicle',
    'Additional Vehicle Information', 'About'],
  'Wi-Fi': ['Wi-Fi', 'Networks', 'Add Hidden Wi-Fi Network', 'Internet'],
  Bluetooth: ['Bluetooth', 'Paired Devices', 'Nearby Devices', 'Make Discoverable', 'Visibility'],
};
