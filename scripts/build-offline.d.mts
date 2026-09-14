type OfflinePlugin = {
  name: string;
  apply: 'build';
  generateBundle: (...args: unknown[]) => void;
};

declare function offlineServiceWorker(options?: { base?: string }): OfflinePlugin;

export { offlineServiceWorker as default, offlineServiceWorker };
