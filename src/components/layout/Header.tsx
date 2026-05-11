import type { GnbTab } from '../../types/navigation';

interface HeaderProps {
  activeGnb: GnbTab;
  onGnbChange: (tab: GnbTab) => void;
}

const GNB_TABS: { key: GnbTab; label: string; icon: string }[] = [
  { key: 'extinguisher', label: '소화기',        icon: '🧯' },
  { key: 'bagfilter',    label: '백필터',         icon: '🔧' },
  { key: 'machinery',    label: '유해위험기계기구', icon: '⚙️' },
];

export default function Header({ activeGnb, onGnbChange }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="flex items-center h-14 px-6 gap-6">

        {/* ← 뒤로가기 */}
        <button className="text-gray-400 hover:text-gray-600 transition shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 로고 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white text-xs font-extrabold tracking-tighter">BK</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-gray-900 tracking-tight">TAEKYUNG BK</div>
            <div className="text-[11px] text-gray-400 font-medium">단양1공장 설비관리시스템</div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-6 w-px bg-gray-200 shrink-0" />

        {/* GNB */}
        <nav className="flex items-center h-full gap-0.5">
          {GNB_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => onGnbChange(key)}
              className={[
                'relative flex items-center gap-1.5 h-full px-4 text-sm font-medium transition-colors whitespace-nowrap',
                activeGnb === key
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              <span className="text-base">{icon}</span>
              {label}
              {activeGnb === key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
              )}
            </button>
          ))}
        </nav>

      </div>
    </header>
  );
}
