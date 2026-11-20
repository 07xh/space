# 07xh Space：Cloudflare Pages 独立预览

本仓库是 **静态 Astro 7 网站**：预览阶段只提供公开文章、项目与静态动态。
当前主线仍是独立静态预览站，不共享旧 Firefly 的管理员登录、动态写入接口、评论后端或 KV 会话。

## 目标

- 只创建新的 Cloudflare Pages 项目，保留旧 `07xh/Firefly` 和 `0701000.xyz` 的所有配置
- 不将预览项目绑定到现有正式域名
- 通过 `*.pages.dev` 独立测试桌面、平板和手机交互

## GitHub Actions 直接上传

使用 Cloudflare Pages **直接上传**项目 `07xh-space-preview`，无需连接 Git。
`.github/workflows/deploy-preview.yml` 在 `07xh/space` 的 `main` 更新或手动触发时，
安装依赖、运行 `pnpm check` 和 `pnpm build`，再用 Wrangler 上传 `dist`。

在仓库 Actions Secrets 中配置 `CLOUDFLARE_API_TOKEN`（当前账户的 Pages Edit 权限）
和 `CLOUDFLARE_ACCOUNT_ID`。不得把 Token 写入仓库。

工作流会检查并创建缺失的直接上传项目。也可以先用 Wrangler 手动创建：

```bash
pnpm dlx wrangler@4 pages project create 07xh-space-preview --production-branch=main
```

工作流部署命令：

```bash
pnpm dlx wrangler@4 pages deploy dist --project-name=07xh-space-preview --branch=main
```

| 参数 | 设置 |
|---|---|
| 生产分支 | `main`（仅部署到新的 Pages 项目） |
| 构建位置 | GitHub Actions，仓库根目录 |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Node.js | 22.12.0 或更新的 22.x |
| pnpm | 9.14.4（与 CI 使用的版本一致） |
| 构建环境变量 | `SPACE_SITE_URL=https://07xh-space-preview.pages.dev`、`CI_SKIP_REMOTE_FONTS=1` |

本仓库默认输出静态页面，不需要安装 `@astrojs/cloudflare` SSR 适配器，
也不需要把旧站的 KV、API Token、会话密钥或 GitHub 写入凭证复制到预览项目。

Actions 构建时显式设置 `SPACE_SITE_URL`，生成与部署地址一致的
canonical/sitemap 地址；直接上传不会自动提供构建环境变量。如果以后绑定 `space.0701000.xyz`，
在正式环境设置 `SPACE_SITE_URL=https://space.0701000.xyz` 后重新构建。

## 上线验收

1. 使用 GitHub Actions [Validate upstream-based site](/../../actions/workflows/build.yml) 核对类型、静态构建、Chromium 浏览器测试
2. 在实际预览网址检查桌面与手机首页滚动动画、底部 MobileDock 展开、项目和文章跳转
3. 检查动态图片九宫格与 Fancybox、图片显示、主题切换、文章目录、站内搜索
4. 核对截图来源、原主题插画和音频素材的使用授权；未确认前不把预览站公开宣传
5. 完成原网址兼容、全部内容与后台写入功能迁移前，不切换 `0701000.xyz`

## 独立预览站评论接入（未启用前不展示）

新站沿用已有 Waline 评论组件，不重新实现评论协议。文章页及项目详情页使用各自的路径区分评论。
默认没有评论后端，`commentConfig.type` 为 `none`，不会渲染无法发送的评论框。

正式启用前必须先在**独立的**评论服务中完成持久化数据库、管理员账号、审核和防刷配置，并核对服务 URL；不能使用 Waline 公开演示地址，也不能直接复用旧 Firefly 数据库。
确认服务可用后在 `07xh/space` 的 GitHub Actions 仓库变量（**Variables，不是公开源码**）设置
`SPACE_WALINE_SERVER_URL=https://你的独立评论服务域名`，随后重新部署 `07xh-space-preview`。
构建只接受 HTTPS 服务地址，不填写或格式无效时保持关闭。

启用验收：发布一条测试评论，刷新后检查持久化、审核后台的显示、恶意链接处理和移动端评论框；未通过前不要对外宣传已开放评论。
此配置不写入、不连接 `0701000.xyz` 或旧博客。

## 仍未完成的功能（不要误当成已上线）

- 旧 Firefly 后台文章及动态发布功能尚未迁入
- 评论前端可复用现有 Waline 组件，但在独立后端和数据库未验收前保持禁用；未配置时不显示评论输入框
- 旧域名正式切换与回滚测试尚未执行
- 部分源主题资源及第三方媒体仍待逐项审查

参考官方文档：

- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
