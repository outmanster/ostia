# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ostia is a cross-platform instant messaging application built on the Nostr protocol. It emphasizes minimalism, privacy-first design, and decentralization.

**Tech Stack:**
- Frontend: React + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Rust + Tauri 2.0
- Protocol: Nostr (using nostr-sdk)
- Storage: Platform-specific secure storage + SQLite cache

**Target Platforms:** Windows, macOS, Linux, iOS, Android (via Tauri 2.0)

## Common Commands

```bash
# Development
pnpm install              # Install frontend dependencies
pnpm tauri dev            # Run development server with hot reload

# Build
pnpm tauri build          # Build for current platform
tauri build --target <platform>  # Build for specific platform

# Rust
cargo check               # Verify Rust dependencies
cargo test                # Run Rust unit tests

# UI Components
npx shadcn-ui@latest add <component>  # Add shadcn/ui components
```

## Architecture

### Data Flow
```
User Action -> React Frontend -> Tauri Commands -> Rust Backend -> Nostr Network
                    ^                                                     |
                    └──────────── State Update ───────────────────────────┘
```

### Key Directories (Planned)
```
src-tauri/src/
├── commands/       # Tauri Commands exposed to frontend (account, messaging, contacts)
├── nostr/          # Nostr protocol services (service, relay, sync, media, encryption)
├── storage/        # Data layer (secure key storage, SQLite database, cache)
└── utils/          # Error types, platform utilities

src/
├── components/     # React components (layout/, chat/, auth/, ui/)
├── hooks/          # Custom hooks (useNostr, useSecureStorage, useMessages)
├── store/          # Zustand stores (authStore, contactStore, messageStore)
├── utils/          # Frontend utilities
└── types/          # TypeScript definitions
```

### Core Rust Dependencies
- `nostr-sdk` - Nostr protocol implementation
- `tauri` - Cross-platform application framework
- `keyring` - Platform-specific credential storage
- `sqlx` - SQLite database operations
- `aes-gcm` - AES-256-GCM encryption for media

## Key Technical Decisions

### Messaging Protocol
Uses **NIP-17** (Gift Wrap) for private messages instead of deprecated Kind 4. This hides metadata (sender/receiver) from relays via the Gift Wrap -> Seal -> Rumor structure.

### Secure Storage
Platform-specific implementations via conditional compilation:
- Windows: Credential Manager
- macOS/iOS: Keychain
- Linux: Secret Service
- Android: Keystore

### Media Upload Strategy
1. Encrypt all media with AES-256-GCM before upload
2. Prioritize self-hosted Blossom server
3. Fall back to public NIP-96 servers
4. Compression to WebP format (max 2048px, 25MB limit)

### Relay Management
- Support for Hybrid mode (default + custom relays) and Exclusive mode (privacy mode, custom only)
- NIP-65 for user relay discovery
- Concurrent connection with fastest relay selection

## Git Commit Convention

```
<type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, test, chore
```

## Important Notes

- Private keys (nsec) are only handled in the Rust backend, never exposed to frontend
- Use `secrecy` crate for memory protection of sensitive data
- Event IDs are used for message deduplication across multiple relays
- Offline sync uses timestamp-based incremental synchronization
- 始终用中文回复
- 文档使用中文
- 注释使用中文
- 不需要支付功能
