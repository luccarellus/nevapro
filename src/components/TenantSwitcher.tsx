import React from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { TenantInfo } from '../types';

interface TenantSwitcherProps {
  tenants?: TenantInfo[];
  activeTenantId?: string;
  onSelectTenant: (tenantId: string) => void;
}

export const TenantSwitcher: React.FC<TenantSwitcherProps> = ({
  tenants = [],
  activeTenantId,
  onSelectTenant,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!tenants || tenants.length <= 1) {
    const single = tenants[0];
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 text-slate-300 text-xs font-medium border border-slate-700/50">
        <Building2 className="w-3.5 h-3.5 text-indigo-400" />
        <span>{single ? single.name : 'NevaPro Principal'}</span>
      </div>
    );
  }

  const activeTenant = tenants.find((t) => t.id === activeTenantId) || tenants[0];

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <Building2 className="w-3.5 h-3.5 text-indigo-400" />
        <span className="max-w-[120px] truncate">{activeTenant?.name || 'Selecione a Escola'}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl z-50 py-1"
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            Alternar Instituição
          </div>

          <div className="max-h-48 overflow-y-auto">
            {tenants.map((tenant) => {
              const isSelected = tenant.id === activeTenant.id;
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    onSelectTenant(tenant.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{tenant.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-2 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSwitcher;
