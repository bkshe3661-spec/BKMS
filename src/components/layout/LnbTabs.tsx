interface Tab {
  key: string;
  label: string;
  iconPath: string;
}

interface LnbTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (tab: string) => void;
}

export default function LnbTabs({ tabs, active, onChange }: LnbTabsProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6">
      <div className="flex gap-0">
        {tabs.map(({ key, label, iconPath }) => (
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
            </svg>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
