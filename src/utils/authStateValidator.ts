import { useAuthStore } from '@/store/authStore';
import { hasMasterPassword } from '@/utils/nostr';

// 全局认证状态验证器，防止循环更新
class AuthStateValidator {
  private static instance: AuthStateValidator;
  private isVerifying: boolean = false;
  private verificationPromise: Promise<boolean> | null = null;

  static getInstance(): AuthStateValidator {
    if (!AuthStateValidator.instance) {
      AuthStateValidator.instance = new AuthStateValidator();
    }
    return AuthStateValidator.instance;
  }

  // 验证认证状态的一致性，防止循环更新
  async validateAuthState(): Promise<boolean> {
    // 如果正在验证，返回当前进行中的验证
    if (this.isVerifying && this.verificationPromise) {
      return this.verificationPromise;
    }

    // 设置验证状态
    this.isVerifying = true;

    // 创建新的验证Promise
    this.verificationPromise = new Promise(async (resolve) => {
      try {
        // 检查后端是否有加密密钥
        const hasEncryptedKey = await hasMasterPassword();

        // 获取当前的auth store状态
        const authState = useAuthStore.getState();

        // 检查状态一致性
        const isConsistent = authState.isAuthenticated === hasEncryptedKey ||
          (authState.isAuthenticated && !!authState.npub) ||
          (!authState.isAuthenticated && !hasEncryptedKey);

        // 如果状态不一致，执行一次性的状态同步
        if (!isConsistent) {
          // 如果前端认为已认证但后端没有密钥，安全地重置状态
          if (authState.isAuthenticated && !hasEncryptedKey) {
            const { logout } = useAuthStore.getState();
            await logout();
          }
        }

        resolve(true);
      } catch (error) {
        console.error('Auth state validation failed:', error);
        resolve(false);
      } finally {
        // 重置验证状态
        setTimeout(() => {
          this.isVerifying = false;
          this.verificationPromise = null;
        }, 100); // 短暂延迟确保状态更新完成
      }
    });

    return this.verificationPromise;
  }
}

export const authStateValidator = AuthStateValidator.getInstance();