# Cursor Constellation

一个基于 Electron + React + TypeScript + Vite 构建的 macOS 桌面应用，用于**真实记录和展示鼠标轨迹**。

## 功能特性

- **真实鼠标采集**：点击开始后记录真实鼠标移动的 x、y、timestamp，并为每个点计算 speed
- **暂停/继续**：点击暂停后停止采集但不清空当前 session，点击继续后接着采集
- **自动保存**：点击停止后结束本次 session 并保存到本地 SQLite 数据库
- **实时显示**：页面上显示当前 session 的点数、开始时间和持续时间
- **历史记录**：历史 session 列表，可以查看之前保存的记录
- **轨迹回放**：点击历史记录可以加载并回放轨迹，速度与真实移动一致
- **时空投影视图**：支持俯视 XY、侧视 Y-T、透视 XY-T 三种同步视角，厚度明确表示时间

## 技术栈

- **Electron**：跨平台桌面应用框架
- **React**：用于构建用户界面
- **TypeScript**：类型安全的 JavaScript
- **Vite**：快速的前端构建工具
- **better-sqlite3**：高性能 SQLite 数据库
- **@electron/rebuild**：原生模块重建工具
- **Canvas API**：用于绘制轨迹

## 项目结构

```
CursorConstellation/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.ts             # 主进程入口（鼠标采集、权限检查、数据库操作）
│   │   ├── preload.ts          # 预加载脚本（IPC 通信桥接）
│   │   ├── types.ts            # 主进程类型定义
│   │   └── tsconfig.json       # 主进程 TypeScript 配置
│   └── renderer/                # React 渲染进程
│       ├── components/          # 轨迹画布、投影视图、回放控制、分析面板等 UI 组件
│       ├── types/               # TypeScript 类型定义
│       │   └── index.ts
│       ├── utils/               # 轨迹分析、格式化等共享工具
│       ├── App.tsx             # 页面容器与状态编排
│       ├── App.css             # 页面壳子与全局交互样式
│       ├── main.tsx            # 渲染进程入口
│       └── index.css           # 全局样式
├── dist/                        # 编译输出目录
├── index.html                  # HTML 入口文件
├── package.json                # 项目配置
├── tsconfig.json               # 根 TypeScript 配置
├── tsconfig.node.json          # Vite 配置 TypeScript
└── vite.config.ts              # Vite 配置
```

## 安装与启动

### 环境要求

- Node.js >= 18
- npm 或 yarn
- macOS（用于鼠标轨迹采集功能，Windows/Linux 不支持全局鼠标权限）

### 安装步骤

```bash
# 克隆项目
git clone <repository-url>
cd CursorConstellation

# 安装依赖（会自动执行 electron-rebuild 重建原生模块）
npm install
```

### 重要：原生模块重建

本项目使用了 `better-sqlite3`，这是一个**原生 Node.js 模块**（用 C++ 编写）。由于 Electron 使用的是修改过的 V8 引擎，其 `NODE_MODULE_VERSION` 与系统安装的 Node.js 不同，因此**必须**对原生模块进行重建。

#### 自动重建

`npm install` 完成后会自动执行 `postinstall` 脚本进行重建。

#### 手动重建

如果遇到模块版本不兼容的错误，手动执行：

```bash
npm run rebuild
```

### 启动

#### 开发模式

开发模式下，Vite 会提供热更新功能，Electron 会自动连接到开发服务器。

```bash
npm run dev
```

#### 生产模式

先编译 TypeScript 代码，然后启动应用。

```bash
npm run start
```

#### 仅启动（不重新编译）

```bash
npm run start:prod
```

## 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式（Vite + Electron） |
| `npm run build` | 编译所有 TypeScript 代码 |
| `npm run build:main` | 仅编译主进程代码 |
| `npm run build:renderer` | 仅编译渲染进程代码 |
| `npm run start` | 编译并启动应用 |
| `npm run start:prod` | 直接启动应用（不重新编译） |
| `npm run rebuild` | 重建 Electron 原生模块 |
| `npm run pack` | 打包应用（不生成安装包） |
| `npm run dist` | 构建并生成安装包 |

## macOS 权限说明

### 重要：必须开启的权限

在 macOS 上，要采集**全局鼠标轨迹**（即鼠标在其他应用窗口上移动时也能采集到），需要开启**可访问性权限**（Accessibility Permission）。

#### 权限要求

| 权限名称 | 用途 | 是否必需 |
|---------|------|---------|
| 可访问性权限 (Accessibility) | 采集全局鼠标位置 | **是** |

#### 权限开启步骤

1. **首次运行时**：应用会自动检测权限状态，如果权限不足会显示警告提示框

2. **手动开启权限**：
   - 打开 **系统偏好设置** (System Preferences)
   - 点击 **隐私与安全性** (Privacy & Security)
   - 点击 **可访问性** (Accessibility)
   - 点击左下角的 🔒 图标解锁
   - 在右侧列表中找到 **CursorConstellation** 并勾选
   - 如果应用已打开，需要**重启应用**才能生效

3. **快速打开权限设置**：
   - 在应用的权限警告框中点击「请求权限」按钮
   - 系统会自动跳转到权限设置页面

#### 权限不足的影响

- ❌ **无法采集全局鼠标轨迹**：鼠标在其他应用窗口上移动时无法被记录
- ❌ **采集到的位置不准确**：可能只能采集到应用窗口内的鼠标位置
- ⚠️ **应用内鼠标移动仍可采集**：即使没有权限，鼠标在本应用窗口内的移动仍可被部分采集，但坐标可能不准确

#### 开发模式下的权限

在开发模式下（`npm run dev`），需要给以下应用开启权限：

- **Electron** 或 **Node.js**（取决于你的开发环境）
- 或者直接给你运行命令的 **终端应用**（Terminal/iTerm2）开启权限

## 使用说明

### 记录鼠标轨迹

1. 启动应用后，确保已开启**可访问性权限**（见上方说明）
2. 点击 **「开始」** 按钮，应用会开始记录真实鼠标移动轨迹
3. 在屏幕上移动鼠标，轨迹会实时显示在画布上
4. 点击 **「暂停」** 按钮，暂停记录（当前 session 保留）
5. 点击 **「继续」** 按钮，恢复记录（从上次暂停的地方继续）
6. 点击 **「停止」** 按钮，结束本次记录，数据会自动保存到 SQLite 数据库

### 查看和回放历史记录

1. 右侧面板显示历史记录列表，按时间倒序排列
2. 点击任意一条历史记录，会自动加载并**回放**该轨迹
3. 回放时的速度与真实移动速度一致
4. 点击回放中的 **「停止」** 按钮可以停止回放
5. 点击历史记录右侧的垃圾桶图标可以删除该记录

### 数据存储位置

所有记录都保存在本地 SQLite 数据库中，路径为：

```
~/Library/Application Support/CursorConstellation/cursor_constellation.db
```

数据库包含两张表：
- `sessions`：存储 session 元信息（开始时间、结束时间、点数等）
- `points`：存储每个轨迹点的 x、y、timestamp、speed

## 故障排除

### 常见问题

#### 1. 启动时提示 "better-sqlite3 was compiled against a different Node.js version"

**原因**：原生模块 `better-sqlite3` 是用系统 Node.js 编译的，与 Electron 使用的 V8 引擎版本不匹配。

**解决方法**：

```bash
npm run rebuild
```

或者删除 node_modules 后重新安装：

```bash
rm -rf node_modules
npm install
```

#### 2. 数据库不可用，历史记录功能无法使用

**原因**：数据库初始化失败，可能是 better-sqlite3 模块未正确加载。

**解决方法**：
- 检查控制台错误信息
- 执行 `npm run rebuild` 重建原生模块
- 确保 `better-sqlite3` 已正确安装

#### 3. 鼠标轨迹无法采集

**原因**：可能是可访问性权限未开启。

**解决方法**：
- 查看应用是否显示权限警告提示
- 按照 "macOS 权限说明" 章节开启权限
- 开发模式下确保给终端或 Electron 应用开启了权限

#### 4. 执行 electron-rebuild 时遇到编译错误

**原因**：可能缺少系统编译工具。

**解决方法**（macOS）：

```bash
# 安装 Xcode 命令行工具
xcode-select --install
```

## 界面预览

应用采用深色主题设计，包含：

- 左侧：轨迹画布、控制按钮、当前 session 统计
- 右侧：历史记录列表
- 权限警告提示（如果权限不足）
- 错误提示横幅（如果发生错误）
- 平滑的动画效果
- 响应式布局

## 打包

### macOS

```bash
npm run dist
```

打包完成后，安装包会生成在 `release/` 目录下。

注意：打包需要图标文件（`assets/icon.icns`），如果没有图标文件，可能需要注释掉 `package.json` 中的 `icon` 配置。

## 错误处理

应用包含完善的错误处理机制：

1. **数据库错误**：如果数据库初始化失败，会显示警告横幅，历史记录功能不可用，但记录功能仍可使用
2. **权限错误**：自动检测权限状态，显示友好的提示框
3. **原生模块错误**：所有数据库操作都有 try-catch 保护，不会导致应用崩溃
4. **IPC 通信错误**：主进程和渲染进程之间的通信都有错误处理

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
