# 07xh Space：Cloudflare Pages 独立预览

本仓库是 **静态 Astro 7 网站**：预览阶段只提供公开文章、项目与静态动态。
这里不包含旧 Firefly 的管理员登录、动态写入接口、评论后端或 KV 会话。

## 目标

- 只创建新的 Cloudflare Pages 项目，保留旧 `07xh/Firefly` 和 `0701000.xyz` 的所有配置
- 不将预览项目绑定到现有正式域名
- 通过 `*.pages.dev` 独立测试桌面、平板和手机交互

## 连接 GitHub 仓库

在 Cloudflare 控制台的 **Workers & Pages → Create → Pages → Connect to Git**
选择 `07xh/space`，不要选择 `07xh/Firefly`。

| 参数 | 设置 |
|---|---|
| 生产分支 | `main`（仅部署到新的 Pages 项目） |
| Framework preset | Astro |
| Root directory | `/` |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Node.js | 22.12.0 或更新的 22.x |
| pnpm | 9.14.4（与 CI 使用的版本一致） |
| 环境变量 | 可设置 `NODE_VERSION=22.16.0`、`PNPM_VERSION=9.14.4` |

本仓库默认输出静态页面，不需要安装 `@astrojs/cloudflare` SSR 适配器，
也不需要把旧站的 KV、API Token、会话密钥或 GitHub 写入凭证复制到预览项目。

Cloudflare 提供预览网址后，构建时可读取 `CF_PAGES_URL` 生成与部署地址一致的
canonical/sitemap 地址。如果以后绑定 `space.0701000.xyz`，
在正式环境设置 `SPACE_SITE_URL=https://space.0701000.xyz` 后重新构建。

## 上线验收

1. 使用 GitHub Actions [Validate upstream-based site](/../../actions/workflows/build.yml) 核对类型、静态构建、Chromium 浏览器测试
2. 在实际预览网址检查桌面与手机首页滚动动画、底部 MobileDock 展开、项目和文章跳转
3. 检查动态图片九宫格与 Fancybox、图片显示、主题切换、文章目录、站内搜索
4. 核对截图来源、原主题插画和音频素材的使用授权；未确认前不把预览站公开宣传
5. 完成原网址兼容、全部内容与后台写入功能迁移前，不切换 `0701000.xyz`

## 仍未完成的功能（不要误当成已上线）

- 旧 Firefly 后台文章及动态发布功能尚未迁入
- 评论系统尚未迁入（当前禁用）
- 旧域名正式切换与回滚测试尚未执行
- 部分源主题资源及第三方媒体仍待逐项审查

参考官方文档：

- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
