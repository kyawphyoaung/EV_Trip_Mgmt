import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AnalysisPage } from './features/analysis/AnalysisPage';
import { ChargingPage } from './features/charging/ChargingPage';
import { MapView } from './features/map/MapView';
import { SettingsPage } from './features/settings/SettingsPage';
import { TripHistory } from './features/trip/TripHistory';
import { Dashboard } from './features/vehicle/Dashboard';
import { ensureSeedData } from './lib/db/database';
import { startOfflineSyncListeners } from './lib/db/offlineSync';

export default function App() {
  useEffect(() => {
    void ensureSeedData();
    return startOfflineSyncListeners();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="map" element={<MapView />} />
          <Route path="trips" element={<TripHistory />} />
          <Route path="charging" element={<ChargingPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
