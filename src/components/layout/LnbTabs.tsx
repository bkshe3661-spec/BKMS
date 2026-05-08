import type { ExtinguisherLnbTab } from '../../types/navigation';

interface LnbTabsProps {
  active: ExtinguisherLnbTab;
  onChange: (tab: ExtinguisherLnbTab) => void;
}

const LNB_TABS: { key: ExtinguisherLnbTab; label: string; icon: JSX.Element }[] = [
  {
    key: 'map',
    label: '공장 도면',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    key: 'list',
    label: '소화기 목록표',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
];

export default function LnbTabs({ active, onChange }: LnbTabsProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6">
      <div className="flex gap-0">
        {LNB_TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              active === key
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700',
            ].join(' ')}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
