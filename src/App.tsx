import { useState } from 'react';
import Header from './components/layout/Header';
import LnbTabs from './components/layout/LnbTabs';
import ExtinguisherMapView from './pages/extinguisher/MapView';
import ExtinguisherListView from './pages/extinguisher/ListView';
import BagFilterMapView from './pages/bagfilter/MapView';
import BagFilterListView from './pages/bagfilter/ListView';
import type { GnbTab, ExtinguisherLnbTab, BagFilterLnbTab } from './types/navigation';
import { initBagFilterStorage } from './services/bagfilterService';

// 앱 시작 시 localStorage 초기화 (키 없을 때만)
initBagFilterStorage();

export default function App() {
  const [activeGnb, setActiveGnb]             = useState<GnbTab>('extinguisher');
  const [extLnb, setExtLnb]                   = useState<ExtinguisherLnbTab>('map');
  const [bfLnb,  setBfLnb]                    = useState<BagFilterLnbTab>('map');

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* 헤더 + GNB */}
      <Header activeGnb={activeGnb} onGnbChange={setActiveGnb} />

      {/* LNB — 각 모듈별 탭 */}
      {activeGnb === 'extinguisher' && (
        <LnbTabs
          tabs={[
            { key: 'map',  label: '공장 도면',    iconPath: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
            { key: 'list', label: '소화기 목록표', iconPath: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
          ]}
          active={extLnb}
          onChange={v => setExtLnb(v as ExtinguisherLnbTab)}
        />
      )}
      {activeGnb === 'bagfilter' && (
        <LnbTabs
          tabs={[
            { key: 'map',  label: '공장 도면',    iconPath: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
            { key: 'list', label: '백필터 목록표', iconPath: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
          ]}
          active={bfLnb}
          onChange={v => setBfLnb(v as BagFilterLnbTab)}
        />
      )}

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        {/* 소화기 */}
        {activeGnb === 'extinguisher' && (
          extLnb === 'map' ? <ExtinguisherMapView /> : <ExtinguisherListView />
        )}
        {/* 백필터 */}
        {activeGnb === 'bagfilter' && (
          bfLnb === 'map' ? <BagFilterMapView /> : <BagFilterListView />
        )}
        {/* 유해위험기계기구 */}
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
