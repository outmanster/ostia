# 参与贡献 Ostia

感谢你对 Ostia 的兴趣！我们欢迎社区贡献，帮助这个隐私优先的 Nostr 信使变得更好。

## 开始之前

### 前置条件

- [Rust](https://www.rust-lang.org/tools/install)（最新稳定版）
- [Node.js](https://nodejs.org/)（v18+）或 [pnpm](https://pnpm.io/installation)
- [Git](https://git-scm.com/)

### 本地开发环境

1. **Fork 并克隆仓库**
   ```bash
   git clone https://github.com/YOUR_USERNAME/ostia.git
   cd ostia
   git remote add upstream https://github.com/outmanster/ostia.git
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **验证环境**
   ```bash
   # 检查 Rust 编译
   cargo check

   # 检查 TypeScript 编译
   pnpm tsc

   # 运行开发服务器
   pnpm tauri dev
   ```

## 如何贡献

### 1. 选择或创建 Issue

- 查看 [Issues](https://github.com/outmanster/ostia/issues) 列表
- 找到想做的事项后在 Issue 下留言说明
- 有新想法时请先创建详细 Issue

### 2. 创建分支

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

### 3. 提交修改

请遵循以下编码规范：

#### Rust 代码
- 提交前运行 `cargo fmt`
- 使用 `cargo clippy` 检查常见问题
- 新功能需要补充测试

#### TypeScript/React 代码
- 使用 TypeScript 严格模式
- 遵循已有组件风格
- 使用 Tailwind CSS 进行样式编写
- 运行 `pnpm tsc` 检查类型

#### 提交信息
我们使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add message retry functionality
^    ^                  ^
|    |                  |
|    |                  +-- 现在时的简短描述
|    +-- 类型：feat、fix、docs、style、refactor、test、chore
+-- 作用域（可选）：messaging、contacts、ui 等
```

### 4. 测试你的修改

```bash
# 运行 Rust 单元测试
cargo test

# 运行 TypeScript 类型检查
pnpm tsc

# 构建应用
pnpm tauri build
```

### 5. 提交 Pull Request

1. 推送分支到你的 fork：
   ```bash
   git push origin feature/your-feature-name
   ```

2. 在 GitHub 创建 Pull Request

3. 按 PR 模板填写：
   - 清晰的变更说明
   - 关联的 Issue 编号
   - 测试步骤
   - UI 变更截图（如有）

## 开发规范

### 架构

Ostia 遵循清晰的分层架构：

```
前端（React） → Tauri 命令 → Rust 后端 → Nostr 协议
```

**关键原则：**
- 私钥永不离开 Rust 后端
- 所有敏感操作都在 Rust 中完成
- 前端只负责 UI 与状态管理

### 代码风格

#### Rust
```rust
// 使用显式错误处理
pub async fn do_something() -> Result<(), String> {
    // ...
}

// 为公有函数添加文档注释
/// 保存消息到数据库
pub async fn save_message(&self, message: &MessageRecord) -> Result<(), String> {
    // ...
}
```

#### TypeScript
```typescript
// 使用 interface 定义类型
interface Message {
  id: string;
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
}

// 使用 Zustand 进行状态管理
export const useMessageStore = create<MessageState>((set, get) => ({
  // ...
}));
```

### 测试

#### Rust 测试
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_message_storage() {
        // 测试实现
    }
}
```

#### 前端测试
前端测试当前计划使用 Vitest（尚未引入）。

### 安全注意事项

1. **不要在前端暴露私钥**
2. Rust 中使用 `secrecy` 保护敏感数据
3. 验证所有用户输入
4. 遵循 Tauri 安全最佳实践
5. 使用平台级安全存储

### 性能

- 长列表使用虚拟滚动
- 合理缓存与去重
- 减少 React 不必要渲染
- I/O 操作尽量异步化

## 项目结构

```
src-tauri/src/
├── commands/       # Tauri 命令（account、messaging、contacts）
│   ├── account.rs
│   ├── messaging.rs
│   └── contacts.rs
├── nostr/          # Nostr 协议服务
│   ├── service.rs
│   ├── relay.rs
│   ├── sync.rs
│   ├── media.rs
│   └── encryption.rs
├── storage/        # 数据持久化
│   ├── secure.rs   # Keyring 集成
│   ├── database.rs # SQLite 操作
│   └── cache.rs
└── utils/          # 工具与错误类型
    ├── platform.rs
    └── error.rs

src/
├── components/     # React 组件
│   ├── ui/         # shadcn/ui 组件
│   ├── layout/     # 布局组件
│   ├── chat/       # 聊天组件
│   └── auth/       # 登录/认证组件
├── hooks/          # 自定义 hooks
├── store/          # Zustand 状态管理
├── utils/          # 前端工具
└── types/          # TypeScript 类型
```

## Issue 标签

- `bug`：功能异常
- `enhancement`：新功能或改进
- `documentation`：文档改进
- `good first issue`：适合新手
- `help wanted`：需要协助
- `security`：安全相关

## 交流方式

- **GitHub Issues**：缺陷与需求
- **GitHub Discussions**：问题讨论
- **Nostr**：后续公布 npub

## 致谢

贡献者将出现在：
- 发行说明
- 贡献者页面

## 有问题？

可以在 Issue 中添加 `question` 标签提问。

---

**感谢你为 Ostia 贡献力量！** 🙏
