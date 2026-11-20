# 小慌博客：独立预览站发布后台验收

> 状态：后台代码仍位于草稿 PR，**未合并到 main**。独立 `admin-acceptance` 预览分支已通过云端 Functions 匿名拒绝访问测试（未配置管理员身份时返回 HTTP 503）；**真实登录、文件写入及发布回读尚未验收**。

## 隔离边界

- **新站**：`https://07xh-space-preview.pages.dev`
- **新后台入口**：`/admin`（Cloudflare Pages Function）
- **管理 API**：`/api/admin/content?kind=posts|dynamic`、`/api/admin/deployment?commit=完整40位SHA`（只读 GitHub Actions 状态）、`/api/admin/upload`
- **唯一写入仓库**：`07xh/space` 的 `main`，只允许 `src/content/posts/` 或 `src/content/dynamic/` 下受控的 Markdown 文件。
- **禁止触碰**：旧 `07xh/Firefly`、旧站的管理员账号/密钥/会话 KV、`0701000.xyz` 及其 DNS/部署绑定。

## 与 GitHub Actions 自动部署的关系

**保持原有方式，不启用 Cloudflare 的 GitHub 自动构建。**

`07xh/space` 的 `main` 收到提交后，现有 `.github/workflows/deploy-preview.yml` 使用 Node 22 + pnpm 构建 Astro 静态站，再由 `cloudflare/wrangler-action@v4` 执行：

```bash
wrangler pages deploy dist --project-name=07xh-space-preview --branch=main
```

Cloudflare Pages 的 Wrangler 直接上传支持仓库**根目录**下的 `functions/`，会在部署静态资源时自动上传 Functions；它不是把 `functions/` 拷进 `dist/`，也不需要为后台另外创建部署项目或 Actions 工作流。

当根目录存在 Functions 时，部署 workflow 先运行管理员访问控制单元测试及 Wrangler Functions 打包，然后按原命令上传。上传后对未登录访问的 `/admin`、`/api/admin/content`、`/api/admin/upload` 做拒绝响应探测（Access 登录重定向或 HTTP 401/403/503），并确认公共首页未坏；任何管理端点意外返回 200/404 或其他异常状态都让 Actions 报错。这些探测只能证明匿名访问被拦截，不能代替真正的管理员登录与写入验收。

所有内容写入仍先发生在 GitHub（单独的细粒度 Token），随后由 GitHub Actions 触发构建，最后 Wrangler 上传预览站。提交成功不代表部署成功。原有 `SPACE_WALINE_SERVER_URL` 变量继续传递给构建。

## Cloudflare Access 作用域（pages.dev 主站与预览别名不同）

Cloudflare Pages 官方文档指出，项目设置中的 `Enable access policy` 默认只保护预览部署 URL（如随机哈希子域名和预览分支），**不会自动保护 `07xh-space-preview.pages.dev` 主域名**。不能把“预览分支已受到 Access 保护”误认为“正式预览站的管理接口已受保护”。

- 在 Cloudflare Zero Trust → Access → Applications 中，为实际使用的管理主机名和 `/admin`、`/api/admin/*` 路径核对单独 Access 应用与仅允许本人登录的策略；同时审查直接可达的随机哈希部署 URL。
- Pages Functions 继续独立校验签名 JWT、Audience 与管理员邮箱，即使某个别名漏配 Access 策略，也不得自动放行。
- 不要为了后台管理直接把**整个公开博客**置于 Access 后面。若将测试分支整站保护，现有匿名公共首页检查需要调整验收标准，不能再以 HTTP 200 作为必达条件。
- `SPACE_ACCESS_AUD` 必须来自实际保护该入口的 Access 应用；若正式预览主域名与分支使用不同 Audience，应分别验收，不能混用单个值。
- 管理员账号与 GitHub 写入 Token 尚未配置、验收前，所有私有接口继续 fail-closed；无需更改 GitHub Actions 部署方式。

官方参考：https://developers.cloudflare.com/pages/configuration/preview-deployments/ 及 https://developers.cloudflare.com/pages/platform/known-issues/ 。

## 部署前的必需配置（只在独立预览 Pages 项目配置）

1. 为独立预览域名的 `/admin` 和 `/api/admin/*` 创建 Cloudflare Access 私有应用和**仅本人**的访问策略，不要给整个网站套管理策略。
2. 为 Pages Functions 配置三个身份变量：`SPACE_ACCESS_TEAM_DOMAIN`（如 `myteam.cloudflareaccess.com`，不带 `https://`）、`SPACE_ACCESS_AUD`（该 Access 应用的 Audience ID）、`SPACE_ADMIN_EMAIL`（唯一允许的管理员邮箱）。
3. 配置 Pages Secret `SPACE_GITHUB_CONTENTS_TOKEN`，使用只授权 **07xh/space** 且仅具备 **Contents: Read and write** 权限的独立细粒度 GitHub Token；不要复用旧 Firefly 的 Token，也不要将密钥写入仓库、聊天或 GitHub Actions 日志。
4. 确认独立 Pages 项目通过 Wrangler 上传并包含 `functions/`，同时保持当前的静态 Astro 构建。配置缺失时后台应返回 503，**绝不能退化为无密码可写**。

## 上线必须全部通过的验收

- 未登录访问 `/admin` 与 `/api/admin/content`：应被 Access 拦截，不能读取文章列表。
- 已登录但邮箱不匹配、Audience 错误、JWT 签名错误、JWT 过期：必须拒绝。
- 跨站 Origin / 非 JSON 写入请求：必须拒绝；绕过 UI 直接提交也一样。
- 本人登录后，后台可以读取真实的 `07xh/space` 文件列表和文章正文。
- 用**单独的测试文件名**新建 Markdown **草稿**，GitHub 返回 commit SHA，随后 GitHub Actions / Pages 部署成功，新站能回读文件；旧站内容保持不变。
- 使用当前 blob SHA 修改草稿；使用过期 SHA 再写入必须返回冲突而不是覆盖别人修改。
- 删除测试草稿，确认 GitHub 和新预览站均已更新；不删除已有文章和项目。
- 再次执行新预览站的真实浏览器验收（文章、项目、图片、移动端），确认新增 Functions 不影响公共静态页面。
- 核验是否生成了独立部署日志；不要把 `GitHub PUT 201` 误称为已经部署完成。

## 发布完成后的可核验状态（新增）

编辑器在新建、修改、删除内容和上传图片得到 GitHub commit SHA 后，提供 **“检查上次提交的部署进度”** 按钮（按需查询，不自动高频轮询）。状态查询经过同一 Cloudflare Access JWT 验证，不能匿名读取。

查询范围固定为新仓库 `07xh/space` 的 `main` 分支，使用 GitHub **公开 Actions 运行元数据**，不让专用于 Contents 的写入密钥再获得 Actions 权限，也不额外创建 Cloudflare 凭证。

- **尚未发现 / 排队 / 正在部署**：只代表 GitHub 已返回或尚未返回相应运行记录，不等于网站已更新。
- **部署完成**：精确匹配提交 SHA 的 `Deploy Cloudflare Pages preview` workflow 已显示成功，表示 Actions 的 Wrangler 上传步骤通过。
- **页面验证中 / 验证失败 / 页面验证通过**：同一提交 SHA 的 `Verify deployed preview article and project pages` 浏览器检查状态；只有成功时才提示“部署后的页面回归测试通过”。
- 查询失败（GitHub 请求失败、限流、旧提交超出最近 100 条运行记录）会明确展示“无法确认”，不得伪装成功；界面提供匹配的 GitHub Actions 运行链接。
- 这些结果是 **GitHub Actions 执行证据**，不是检查某位读者浏览器中的缓存，也不能替代 Cloudflare Access 本人登录、真实文件保存和图片上传的最终验收。

## 图片上传（待线上验收）

- 后台编辑器复用旧 Firefly 的图片类型和魔数检查：仅 PNG、JPEG、WebP、GIF；单文件不超过 4 MiB。
- 页面通过同源 `/api/admin/upload` 上传；后台验证相同的 Cloudflare Access JWT，拒绝来自其他来源的提交。
- 图片只创建于新仓库 `07xh/space` 的 `public/uploads/YYYYMMDD-随机名.扩展名`，不访问旧仓库或旧媒体库。
- 新后台在当前光标位置插入 `![图片](/uploads/文件名)`；GitHub 提交后需要等待**新预览站部署成功**才可以打开对应图片。
- 应验证：正常图片上传、伪造类型被拒、重复文件名不会覆盖、构建成功、文章图片在线解码、发布回滚。
- 目前仅完成模拟测试与编译检查，**尚未使用线上真实管理员账号完成上传**。

## 当前已实现的门禁

后台的写入逻辑是独立于旧 Worker 的 Cloudflare Pages Functions，校验 Cloudflare Access JWT 的 RSA 签名、Issuer、Audience、管理员邮箱和有效期。写入时还有同源 Origin、专用 Header、JSON、大小上限、固定仓库路径与 GitHub SHA 冲突检查。未填写配置时采取 fail-closed。

这些能力已通过 Node 模拟授权测试及 Wrangler 编译测试，**真实 Cloudflare Access、密钥、服务端写入和回读仍需独立验收**。
