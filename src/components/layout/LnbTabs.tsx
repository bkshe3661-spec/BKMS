import type { ExtinguisherLnbTab } from '../../types/navigation';

interface LnbTabsProps {
  active: ExtinguisherLnbTab;
  onChange: (tab: ExtinguisherLnbTab) => void;
}

const LNB_TABS: { key: ExtinguisherLnbTab; label: string; icon: string }[] = [
  { key: 'map',  label: '공장 도면', icon: '🗺️' },
  { key: 'list', label: '소화기 목록표', icon: '📋' },
];

export default function LnbTabs({ active, onChange }: LnbTabsProps) {
  return (
    <div className="bg-gray-50 border-b border-gray-200 px-6">
      <div className="flex gap-1">
        {LNB_TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t transition-colors border-b-2',
              active === key
                ? 'text-blue-600 border-blue-600 bg-white'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100',
            ].join(' ')}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
