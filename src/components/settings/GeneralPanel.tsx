import React from 'react';
import { Globe, Package } from '@lucide/vue';
import { useAppStore } from '../../store/useAppStore';

interface GeneralPanelProps {
  t: (zh: string, en: string) => string;
}

export const GeneralPanel: React.FC<GeneralPanelProps> = ({ t }) => {
  const { language, setLanguage } = useAppStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Package className="w-6 h-6 text-gray-700 dark:text-text-secondary" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-text-primary">
          {t('通用设置', 'General Settings')}
        </h3>
      </div>

      <div className="gsm-panel p-5 sm:p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Globe className="w-5 h-5 text-gray-700 dark:text-text-secondary" />
          <h4 className="font-medium text-gray-900 dark:text-text-primary">
            {t('语言设置', 'Language Settings')}
          </h4>
        </div>
        
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg border border-black/[0.06] dark:border-white/[0.04] hover:bg-light-bg dark:hover:bg-white/10 transition-colors">
            <input
              type="radio"
              name="language"
              value="zh"
              checked={language === 'zh'}
              onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
              className="w-4 h-4 text-brand-violet bg-light-surface border-black/[0.06] focus:ring-brand-violet dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-white/[0.04] dark:border-white/[0.04]"
            />
            <div>
              <span className="text-base font-medium text-gray-900 dark:text-text-primary">
                中文
              </span>
              <p className="text-xs text-gray-500 dark:text-text-tertiary">
                Simplified Chinese
              </p>
            </div>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg border border-black/[0.06] dark:border-white/[0.04] hover:bg-light-bg dark:hover:bg-white/10 transition-colors">
            <input
              type="radio"
              name="language"
              value="en"
              checked={language === 'en'}
              onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
              className="w-4 h-4 text-brand-violet bg-light-surface border-black/[0.06] focus:ring-brand-violet dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-white/[0.04] dark:border-white/[0.04]"
            />
            <div>
              <span className="text-base font-medium text-gray-900 dark:text-text-primary">
                English
              </span>
              <p className="text-xs text-gray-500 dark:text-text-tertiary">
                US English
              </p>
            </div>
          </label>
        </div>
      </div>

    </div>
  );
};
