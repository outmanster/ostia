// 应用初始化管理器，用于处理可能导致循环更新的初始化逻辑
class AppInitializationManager {
  private static instance: AppInitializationManager;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  static getInstance(): AppInitializationManager {
    if (!AppInitializationManager.instance) {
      AppInitializationManager.instance = new AppInitializationManager();
    }
    return AppInitializationManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise(async (resolve) => {
      try {
        // 执行一次性初始化逻辑
        await this.performInitialization();
        this.isInitialized = true;
      } catch (error) {
        console.error('App initialization failed:', error);
      } finally {
        resolve();
      }
    });

    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    // 在这里进行所有初始状态校验，避免在组件中进行
    console.log('Performing app initialization...');
  }

  isAppInitialized(): boolean {
    return this.isInitialized;
  }
}

export const appInitializationManager = AppInitializationManager.getInstance();