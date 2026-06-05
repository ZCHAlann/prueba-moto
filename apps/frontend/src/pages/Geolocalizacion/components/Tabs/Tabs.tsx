export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export const Tabs = ({ tabs, active, onChange }: Props) => (
  <div className="flex gap-1 border-b border-slate-200">
    {tabs.map((tab) => {
      const isActive = active === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            relative px-4 py-2.5 text-sm font-medium transition
            ${isActive
              ? 'text-blue-600'
              : 'text-slate-500 hover:text-slate-700'}
          `}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  rounded-full px-1.5 py-0.5 text-[10px] font-semibold
                  ${isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500'}
                `}
              >
                {tab.count}
              </span>
            )}
          </span>
          {isActive && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />
          )}
        </button>
      );
    })}
  </div>
);