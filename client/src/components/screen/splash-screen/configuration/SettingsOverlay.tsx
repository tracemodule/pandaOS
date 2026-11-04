import React, { useRef, useEffect } from 'react';
import NavTree from '../../../settings/control-bar/navtree';
import { useUIStore } from '../../../../store/uiStore';
import { User, Download, Bell, Bluetooth, Signal, Info, RotateCw } from 'lucide-react';

const SettingsOverlay: React.FC = () => {
  const { isMenuOpen, activeTab, btDevices, isScanning, btStatusMessage, startScan, connectToDevice, disconnectDevice, isSocketReady, keyboardValue, openKeyboard } = useUIStore();
  const hasScanned = useRef(false);

  useEffect(() => {
    if (isMenuOpen && activeTab === 'Bluetooth' && isSocketReady) {
      if (!hasScanned.current) {
        hasScanned.current = true;
        startScan();
      }
    } else {
      hasScanned.current = false;
    }
  }, [isMenuOpen, activeTab, isSocketReady, startScan]);

  return (
    <div 
      className="settings-overlay-container" 
      style={{
        transform: isMenuOpen ? 'translateY(0)' : 'translateY(100%)',
        visibility: isMenuOpen ? 'visible' : 'hidden',
        pointerEvents: isMenuOpen ? 'auto' : 'none',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.4s'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <NavTree /> 
      
      <div className="settings-content-area">
        <header>
          <div className="header-left">
            <User size={24} />
            <h3>{activeTab === 'Bluetooth' ? 'Bluetooth' : 'Settings'}</h3>
          </div>
          <div className="header-icons">
            <Download size={18} /><Bell size={18} /><Bluetooth size={18} /><Signal size={18} />
          </div>
        </header>

        <div className="settings-body">
          {activeTab === 'Bluetooth' ? (
            <div className="bluetooth-screen">
              <div className="bt-header">
                <div className="bt-title-group">
                  <span>Nearby Devices</span>
                  <RotateCw size={16} className={isScanning ? 'spin-animation' : ''} onClick={() => isSocketReady && startScan()} />
                </div>
              </div>
              <div style={{ color: isSocketReady ? '#2E78FF' : 'red' }}>{btStatusMessage}</div>
              <div className="bt-device-list">
                {btDevices.map((device, index) => (
                  <div className={`bt-device-box ${device.connected ? 'active' : ''}`} key={index}>
                    <span>{device.name}</span>
                    <button onClick={() => device.connected ? disconnectDevice(device.address) : connectToDevice(device.address)}>
                      {device.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <input type="text" className="settings-search" placeholder="Search" value={keyboardValue} onFocus={() => openKeyboard(keyboardValue)} readOnly />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsOverlay;