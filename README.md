# Request Forwarder

Request Forwarder 是一个基于 Chrome Manifest V3 的请求转发扩展，用于在浏览器本地管理重定向规则，并通过 `declarativeNetRequest` 动态规则将请求转发到目标地址。

## 项目简介

Request Forwarder 主要用于本地调试、接口转发、Mock 替换和环境切换。你可以直接在扩展中配置规则，把指定请求转发到本地、测试或其他目标服务，而不需要额外部署代理服务、修改后端配置或侵入业务代码。

## 产品优势

- 轻量：无需单独启动代理服务、数据库或本地守护进程
- 本地部署：规则保存在浏览器本地存储中，执行也完全在扩展内部完成
- 开箱即用：安装扩展后即可配置和使用，适合个人调试和小团队协作
- 低侵入：不需要修改业务项目代码，也不需要接入额外中间层
- 调试高效：可以快速切换接口目标、Mock 地址和测试环境

## 当前能力

- 详情页规则编辑器
- Popup 全局开关和规则快速查看
- 后台 Service Worker 在安装、启动和存储变更时自动同步 DNR 规则
- 规则命中高亮与命中次数反馈
- 扩展图标命中数 badge 提示
- JSON 导入 / 导出
- 规则冲突与重复的轻量诊断
- 基础规则校验
- 覆盖规则校验和 DNR 转换的 Vitest 测试

## 架构说明

- `src/background/index.ts`：存储初始化、DNR 同步、图标状态与命中反馈
- `src/core/rules.ts`：规则模型、校验逻辑、DNR 转换
- `src/core/storage.ts`：popup / options / background 共用的存储 API
- `src/options/*`：完整规则管理页
- `src/popup/*`：快捷操作弹窗

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run release:prepare -- 0.0.3
```

## 发布流程

使用发布脚本可以在本地准备 GitHub Release：

```bash
npm run release:prepare -- 0.0.3
```

脚本会自动完成以下步骤：

- 同步 `package.json`、`package-lock.json`、`src/manifest.json` 的版本号
- 执行 `lint`、`test`、`build`
- 创建或更新 `releases/v<version>.md`
- 将 `dist/` 打包为 `releases/request-forwarder-v<version>.zip`
- 输出对应的 `gh release create ...` 命令

如果使用 GitHub Actions，只需要推送版本标签，例如：

```bash
git tag -a v0.0.3 -m "Release v0.0.3"
git push origin v0.0.3
```

工作流会自动安装依赖、执行校验、构建产物并创建 GitHub Release。

## 说明

- 当前 MVP 直接使用 Chrome 的 `urlFilter`，没有额外封装自定义规则语言
- 当前重定向动作主要支持绝对 URL 转发
- 当前 `host_permissions` 仍为 `<all_urls>`，后续可以按实际业务域名继续收敛
- 英文版文档见 [README.en.md](/README.en.md)
- 更新日志见 [CHANGELOG.md](/CHANGELOG.md) / [CHANGELOG.zh.md](/CHANGELOG.zh.md)
