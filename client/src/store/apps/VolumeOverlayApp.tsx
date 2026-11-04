import React from 'react';

// De volume-popup wordt nu vanuit de ControlBar gerenderd (VolumePopup.tsx),
// verankerd direct boven het speaker-icoon. Dit component blijft bestaan omdat
// SplashScreen het nog importeert, maar rendert bewust niets zodat er maar één popup is.
const VolumeOverlayApp: React.FC = () => null;

export default VolumeOverlayApp;
