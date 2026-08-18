import { defineComponent, onErrorCaptured, ref } from 'vue';
import { PROJECT_ISSUES_URL } from '../constants/project';
import { logger } from '../services/logger';

const getLocalizedStrings = () => {
  const lang = navigator.language?.startsWith('zh') ? 'zh' : 'en';
  return {
    title: lang === 'zh' ? '应用加载出错' : 'Application Error',
    description: lang === 'zh' ? '应用出错了。' : 'The application encountered an error.',
    reload: lang === 'zh' ? '重新加载页面' : 'Reload Page',
    reportIssue: lang === 'zh' ? '在 GitHub 上反馈问题' : 'Report Issue on GitHub',
    toggleDetails: lang === 'zh' ? '显示错误详情' : 'Show error details',
    errorDetails: lang === 'zh' ? '错误详情' : 'Error details',
    stackTrace: lang === 'zh' ? '堆栈跟踪' : 'Stack trace',
    copyError: lang === 'zh' ? '复制错误信息' : 'Copy error',
    copied: lang === 'zh' ? '已复制' : 'Copied',
  };
};

export const ErrorBoundary = defineComponent({
  name: 'ErrorBoundary',
  setup(_, { slots }) {
    const hasError = ref(false);
    const error = ref<Error | null>(null);
    const errorInfo = ref('');
    const showDetails = ref(false);
    const copied = ref(false);

    onErrorCaptured((capturedError, _instance, info) => {
      const normalizedError = capturedError instanceof Error ? capturedError : new Error(String(capturedError));
      hasError.value = true;
      error.value = normalizedError;
      errorInfo.value = info;
      logger.errorFromError('ui.errorBoundary', 'Caught error', normalizedError, {
        message: normalizedError.message,
        componentStack: info,
      });
      return false;
    });

    const copyError = async () => {
      const errorText = [
        `Error: ${error.value?.message || String(error.value)}`,
        '',
        'Stack Trace:',
        error.value?.stack || '',
        '',
        'Component Stack:',
        errorInfo.value,
      ].join('\n');

      try {
        await navigator.clipboard.writeText(errorText);
        copied.value = true;
        window.setTimeout(() => { copied.value = false; }, 1600);
      } catch (copyErrorValue) {
        logger.errorFromError('ui.errorBoundary', 'Failed to copy', copyErrorValue);
      }
    };

    return () => {
      if (!hasError.value) return slots.default?.();

      const strings = getLocalizedStrings();
      return (
        <div className="min-h-screen bg-light-bg flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <div className="text-center">
              <div className="mb-4 text-5xl">😵</div>
              <h1 className="mb-2 text-xl font-bold text-gray-900">{strings.title}</h1>
              <p className="mb-4 text-gray-700">{strings.description}</p>
              {error.value ? (
                <div className="mb-4 rounded bg-gray-100 p-3 text-left">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{strings.errorDetails}</span>
                    <button type="button" onClick={() => void copyError()} className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300">
                      {copied.value ? strings.copied : strings.copyError}
                    </button>
                  </div>
                  <p className="break-words font-mono text-sm text-gray-700">{error.value.message}</p>
                </div>
              ) : null}
              <div className="mb-4">
                <button type="button" onClick={() => { showDetails.value = !showDetails.value; }} className="text-sm text-brand-violet underline">
                  {strings.toggleDetails}
                </button>
                {showDetails.value ? (
                  <div className="mt-2 max-h-64 overflow-auto rounded bg-light-surface p-3 text-left">
                    <p className="mb-2 text-xs font-semibold text-gray-900">{strings.stackTrace}</p>
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-700">{error.value?.stack || 'No stack trace available'}</pre>
                    {errorInfo.value ? <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs text-gray-700">{errorInfo.value}</pre> : null}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <button type="button" onClick={() => window.location.reload()} className="w-full rounded-lg bg-brand-indigo px-4 py-2 text-white hover:bg-brand-hover">
                  {strings.reload}
                </button>
                <button type="button" onClick={() => window.open(PROJECT_ISSUES_URL, '_blank')} className="w-full rounded-lg bg-gray-100 px-4 py-2 text-gray-900 hover:bg-gray-200">
                  {strings.reportIssue}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    };
  },
});
