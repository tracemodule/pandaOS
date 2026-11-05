// Zoekindex voor "Instellingen zoeken": per pagina (activeTab) de titels en instellingen die erop staan.
// Engelse sleutels; het zoeken vergelijkt ook met de vertaling (t()). Nieuwe instelling? Zet hem hier ook bij.
export const SETTINGS_INDEX: Record<string, string[]> = {
  Vehicle: ['Transmission', 'Paint', 'Licence plate', 'Colouriser', 'Paint Type', 'Wheels', 'Window Tint', 'Headlights', 'Mirrors', 'Grille',
    'Exhaust', 'Reverse camera', 'Graphics'],
  Advanced: ['Tools', 'Apply settings of my car', 'CAN monitor', 'CAN bus', 'CAN box (box ↔ radio)', 'Vehicle protocol (car ↔ box)', 'Radio settings', 'Hide system bar of the radio', 'Hide volume bar of the radio', 'Camera app of the radio'],
  Display: ['Recent apps in the dock', 'App menu button', 'App menu', 'Slide up', 'Dock icons', 'Grow with dock', 'Time zone', 'Set time automatically', 'Language', 'Appearance', 'Brightness', 'Night Filter', 'Text Size', 'Dock height', 'Time', 'Energy Display',
    'Distance', 'Temperature'],
  Trips: ['Trips', 'Drives', 'Distance', 'Top Speed', 'Hard acceleration', 'Hard braking'],
  Navigation: ['Map', 'Mapbox', 'Fuel', 'On the map', 'Petrol stations', 'Charging stations', 'Food and drinks', 'Parking', 'Groceries', 'Toilets', 'Record drives', 'Delete all drives', 'Home address', 'Work address', 'Navigation Volume', 'Avoid Motorways', 'Avoid Tolls', 'Avoid Ferries'],
  Safety: ['Speed cameras', 'Speed Limit Warning', 'Warn Above Limit', 'Warning', 'Show Speed Limit'],
  Maintenance: ['Maintenance', 'Engine & Diagnostics'],
  Apps: ['Android apps', 'Open automatically'],
  Permissions: ['Permissions', 'Home screen', 'Keyboard', 'Panel', 'Camera', 'Microphone', 'Location', 'Contacts', 'Call history',
    'Calendar', 'Messages', 'Notifications and media', 'Show over other apps', 'Radio log', 'System settings', 'Half-screen apps'],
  Software: ['Release notes', 'Manual', 'Settings view', 'Software', 'Version', 'Software Update', 'WebView', 'Report a problem', 'Name Your Vehicle',
    'Additional Vehicle Information', 'About'],
  'Wi-Fi': ['Wi-Fi', 'Networks', 'Add Hidden Wi-Fi Network', 'Internet'],
  Bluetooth: ['Contacts from Google account', 'Bluetooth', 'Paired Devices', 'Nearby Devices', 'Make Discoverable', 'Visibility'],
};
