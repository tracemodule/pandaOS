// src/App.tsx
import React, { useEffect, useState } from 'react';
import SplashScreen from './components/screen/splash-screen/SplashScreen';
import DevConsoleWindow from '../src/components/screen/splash-screen/configuration/DevConsoleWindow';
import './App.scss'; 

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Dit is handig voor als je React Router niet gebruikt, 
  // het kijkt letterlijk naar wat er in de URL bar staat.
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Als we op de dev-console route zitten, laad ALLEEN de console
  if (currentPath === '/dev-console') {
    return <DevConsoleWindow />;
  }

  // Standaard PandaOS inladen voor alle andere URLs (zoals '/')
  return <SplashScreen />;
}

export default App;