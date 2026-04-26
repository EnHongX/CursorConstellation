# Cursor Constellation

一个基于 Electron + React + TypeScript + Vite 构建的 macOS 桌面应用，用于记录和展示鼠标轨迹。

## 功能特性

- **开始记录**：点击开始按钮，应用将使用模拟数据持续绘制鼠标移动路径
- **暂停记录**：点击暂停按钮，停止更新轨迹
- **继续记录**：点击继续按钮，恢复轨迹记录
- **停止记录**：点击停止按钮，结束本次记录并显示 session 统计信息
- **轨迹展示**：实时在画布上绘制平滑的轨迹线
- **统计信息**：记录结束后显示轨迹点数和持续时间

## 技术栈

- **Electron**：跨平台桌面应用框架
- **React**：用于构建用户界面
- **TypeScript**：类型安全的 JavaScript
- **Vite**：快速的前端构建工具
- **Canvas API**：用于绘制轨迹

## 项目结构

```
CursorConstellation/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.ts             # 主进程入口
│   │   ├── preload.ts          # 预加载脚本
│   │   └── tsconfig.json       # 主进程 TypeScript 配置
│   └── renderer/                # React 渲染进程
│       ├── components/          # React 组件（如有）
│       ├── types/               # TypeScript 类型定义
│       │   └── index.ts
│       ├── App.tsx             # 主应用组件
│       ├── App.css             # 应用样式
│       ├── main.tsx            # 渲染进程入口
│       └── index.css           # 全局样式
├── dist/                        # 编译输出目录
├── index.html                  # HTML 入口文件
├── package.json                # 项目配置
├── tsconfig.json               # 根 TypeScript 配置
├── tsconfig.node.json          # Vite 配置 TypeScript
└── vite.config.ts              # Vite 配置
```

## 安装

确保你已经安装了 Node.js（推荐 v18 或更高版本）和 npm。

```bash
# 克隆项目
git clone <repository-url>
cd CursorConstellation

# 安装依赖
npm install
```

## 启动

### 开发模式

开发模式下，Vite 会提供热更新功能，Electron 会自动连接到开发服务器。

```bash
npm run dev
```

### 生产模式

先编译 TypeScript 代码，然后启动应用。

```bash
npm run start
```

## 可用脚本

- `npm run dev`：启动开发模式（Vite + Electron）
- `npm run build`：编译所有 TypeScript 代码
- `npm run build:main`：仅编译主进程代码
- `npm run build:renderer`：仅编译渲染进程代码
- `npm run start`：编译并启动应用
- `npm run pack`：打包应用（不生成安装包）
- `npm run dist`：构建并生成安装包

## 使用说明

1. 启动应用后，你会看到一个带有四个按钮和一个空白画布的界面
2. 点击 **「开始」** 按钮，应用会开始生成模拟轨迹数据并在画布上绘制
3. 点击 **「暂停」** 按钮，轨迹绘制会暂时停止
4. 点击 **「继续」** 按钮，恢复轨迹绘制
5. 点击 **「停止」** 按钮，结束本次记录，界面会显示本次 session 的轨迹点数和持续时间
6. 你可以再次点击 **「开始」** 按钮开始新的记录

## 界面预览

应用采用深色主题设计，包含：
- 渐变背景和发光效果
- 圆角按钮和卡片设计
- 实时状态指示器
- 平滑的动画效果
- 响应式布局

## 开发说明

### 主进程

主进程代码位于 `src/main/` 目录下，负责：
- 创建和管理浏览器窗口
- 处理应用生命周期事件
- 在开发模式下连接到 Vite 开发服务器

### 渲染进程

渲染进程代码位于 `src/renderer/` 目录下，是一个标准的 React 应用，负责：
- 提供用户界面
- 管理记录状态（开始/暂停/继续/停止）
- 使用 Canvas 绘制轨迹
- 显示统计信息

### 模拟数据

应用使用数学函数生成平滑的模拟轨迹数据，结合正弦和余弦函数创建自然的移动模式。

## 打包

### macOS

```bash
npm run dist
```

打包完成后，安装包会生成在 `release/` 目录下。

注意：打包需要图标文件（`assets/icon.icns`），如果没有图标文件，可能需要注释掉 `package.json` 中的 `icon` 配置。

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
