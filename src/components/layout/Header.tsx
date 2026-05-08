import type { GnbTab } from '../../types/navigation';

interface HeaderProps {
  activeGnb: GnbTab;
  onGnbChange: (tab: GnbTab) => void;
}

const GNB_TABS: { key: GnbTab; label: string }[] = [
  { key: 'extinguisher', label: '소화기' },
  { key: 'bagfilter',    label: '백필터' },
  { key: 'machinery',    label: '유해위험기계기구' },
];

export default function Header({ activeGnb, onGnbChange }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center h-14 px-6 gap-8">
        {/* 로고 */}
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="/logo.png"
            alt="TAEKYUNG BK"
            className="h-8 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-base font-bold text-gray-800 tracking-tight leading-tight">
            태경비케이<br />
            <span className="text-xs font-medium text-blue-600">단양1공장 설비관리시스템</span>
          </span>
        </div>

        {/* GNB */}
        <nav className="flex items-center h-full gap-1">
          {GNB_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onGnbChange(key)}
              className={[
                'relative h-full px-4 text-sm font-medium transition-colors',
                activeGnb === key
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {label}
              {activeGnb === key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
              )}
            </button>
          ))}
        </nav>

        {/* 우측 시스템명 */}
        <div className="ml-auto text-xs text-gray-400 shrink-0">
          BKMS v1.0
        </div>
      </div>
    </header>
  );
}
