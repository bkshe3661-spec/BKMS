import { useState } from 'react';
import Header from './components/layout/Header';
import LnbTabs from './components/layout/LnbTabs';
import MapView from './pages/extinguisher/MapView';
import ListView from './pages/extinguisher/ListView';
import type { GnbTab, ExtinguisherLnbTab } from './types/navigation';


export default function App() {
  const [activeGnb, setActiveGnb] = useState<GnbTab>('extinguisher');
  const [activeLnb, setActiveLnb] = useState<ExtinguisherLnbTab>('map');

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* 헤더 + GNB */}
      <Header activeGnb={activeGnb} onGnbChange={setActiveGnb} />

      {/* 소화기 탭일 때만 LNB 노출 */}
      {activeGnb === 'extinguisher' && (
        <LnbTabs active={activeLnb} onChange={setActiveLnb} />
      )}

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        {activeGnb === 'extinguisher' && (
          activeLnb === 'map' ? <MapView /> : <ListView />
        )}
        {activeGnb === 'bagfilter' && (
          <div className="flex items-center justify-center h-full py-32 text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🔧</div>
              <p className="text-lg font-medium">백필터 관리</p>
              <p className="text-sm mt-1">준비 중입니다</p>
            </div>
          </div>
        )}
        {activeGnb === 'machinery' && (
          <div className="flex items-center justify-center h-full py-32 text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">⚙️</div>
              <p className="text-lg font-medium">유해위험기계기구 관리</p>
              <p className="text-sm mt-1">준비 중입니다</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
