# Fic Rating

一个纯前端(无构建工具、无框架)的个人同人/原创小说评分与阅读记录工具，带有和 AO3 一样的标签筛选(分级/分类/警告/完结状态)。链接字段不限定平台，AO3、Lofter、晋江等任意小说/同人网站的作品都可以记录。数据通过 GitHub Contents API 存在这个仓库自己的 `data.json` 里，手机和电脑用同一个 GitHub Personal Access Token 就能同步。

线上地址:https://<你的用户名>.github.io/fic-rating/

## 目录结构

```
index.html          页面骨架 + 3 个视图容器(列表/添加/设置) + 底部导航
css/style.css        全部样式(墨水屏风格:黑白、无圆角、无阴影、无过渡动画)
js/app.js            路由 + 渲染 + 事件绑定(唯一直接操作 DOM 的文件)
js/github-api.js     GitHub Contents API 读写封装 + 本地模式回退 + 失败重试
js/works.js           作品的增删改查、AO3 风格标签筛选、排序(纯函数,无副作用)
js/tags.js            标签文本解析(逗号/顿号/换行分隔)与标签云统计(纯函数)
js/date-utils.js       日期字符串("YYYY-MM-DD")处理小工具
```

`works.js` / `tags.js` / `date-utils.js` 都是不依赖 DOM 的纯函数模块,可以直接用 `bun run` 之类的脚本单独测试。`app.js` 是唯一知道 `document`/`window` 存在的文件。

## 单仓库架构

这个项目**只用一个公开仓库**：代码和 `data.json` 放在一起，`data.json` 也是公开可见的(评分/锐评这些内容不是隐私顾虑，图的是简单——不用像"墨水屏"项目那样再建一个私有数据仓)。

即使仓库公开，写入 GitHub Contents API 仍然需要认证(匿名只能读，不能写)，所以还是要在"设置"页填一个 GitHub Personal Access Token。owner/repo/branch/path/token 只存在浏览器的 `localStorage` 里，代码里没有写死。未配置 token 时，自动退回 `localStorage` 本地模式，不需要 PAT 也能把整个 UI 跑起来测试。

## 数据模型(`data.json`)

```json
{
  "version": 1,
  "works": [
    {
      "id": "1789012345678-a1b2c3",
      "title": "标题",
      "author": "作者",
      "url": "https://archiveofourown.org/works/12345678",
      "fandom": ["原创"],
      "relationship": ["角色A/角色B"],
      "tags": ["ABO", "治愈"],
      "rating": 4,
      "notes": "锐评正文……",
      "contentRating": "T",
      "category": ["F/M", "Gen"],
      "warning": "no-warning",
      "warningDetail": "",
      "status": "complete",
      "dateAdded": "2026-07-13",
      "dateUpdated": "2026-07-13"
    }
  ],
  "meta": { "lastUpdated": "2026-07-13T09:00:00Z" }
}
```

字段说明:

- **`id`**:创建时生成一次,`${Date.now()}-${随机6位}`,之后不变。
- **`contentRating`**(单选):`"G" | "T" | "M" | "E" | "not-rated"`。
- **`category`**(可多选数组):取值 `"F/F" | "F/M" | "Gen" | "M/M" | "Multi" | "Other"`;空数组表示"未分类"。
- **`warning`**(单选):`"no-warning" | "warning-applies" | "not-chosen" | "external-work"`;只有 `"warning-applies"` 时 `warningDetail` 才有意义。
- **`status`**(单选):`"wip" | "complete" | "unknown"`。
- **`tags`** / **`fandom`** / **`relationship`**:都存成去重、trim 过的字符串数组,录入时用同一套标签输入框——打字后按逗号或回车确认成一个标签(没有的标签直接创建),点标签上的 × 删除,支持一条记录填多个(比如 crossover 的多 Fandom、多 CP 的合集向作品)。同人作品的 Fandom 填具体圈名,原创作品不填时自动存成 `["原创"]`。

## AO3 风格标签筛选

列表页的筛选面板对 `contentRating`/`category`/`warning`/`status` 四组各提供勾选框,勾选逻辑和 AO3 一致:同一组内多选取**并集**(比如同时勾 G 和 T),不同组之间取**交集**(比如勾了 G 又勾了 Gen,只显示同时满足两者的作品);再叠加一个跨 title/author/fandom/relationship/tags 的不区分大小写子串搜索。列表上方的"热门标签"云是从当前库里实际用到的 `tags` 值统计出来的,点一下只是把这个词填进搜索框,不是单独的第五个筛选维度。

## GitHub 同步(`github-api.js`)

- 未配置 owner/repo/token 时自动退回**本地模式**(读写 `localStorage`)。
- `loadData()` / `mutate(mutationFn)` 都走同一个 `withRetry()`:不管是 409(sha 冲突)还是普通网络抖动,都会重试,每次重试前有个小的随机退避,重试时会重新 GET 最新的 sha 再应用同一个修改,不是重放旧数据。
- 读请求带 `cache: 'no-store'` + 时间戳参数,避免浏览器缓存返回过期的 sha 导致永远 409。
- 写入用 GitHub Contents API 的标准"读 sha → 带 sha 写"流程,404(文件还不存在)时不带 sha,相当于自动建档。

## 一次性设置(新环境/新账号需要做的事)

1. 在 GitHub 上把这个仓库设为 **Public**(免费账号的 GitHub Pages 只支持公开仓库),根目录放一个 `data.json`,内容为 `{"version":1,"works":[],"meta":{"lastUpdated":null}}`。
2. 仓库设置里开启 Pages:Settings → Pages → Source 选 "Deploy from a branch" → `main` / `(root)`。
3. 生成 fine-grained PAT:GitHub → Settings → Developer settings → Fine-grained tokens → New token,Repository access 只选这一个仓库,Permissions → Contents 设为 **Read and write**,其余都不给。
4. 手机和电脑分别打开 Pages 网址 → 设置页 → 填 owner / repo(`fic-rating`)/ branch(`main`)/ path(`data.json`)/ token → 保存并同步。

## 部署缓存的坑

GitHub Pages 对静态文件设置了约 10 分钟的浏览器缓存,而手机 Safari 没有真正的"强制刷新"手势。所以 `index.html` 里的 `<script src="js/app.js?v=N">`、`<link href="css/style.css?v=N">`,以及 `app.js` 内部对其他模块的 `import ... from './xxx.js?v=N'`,都带着同一个版本号查询参数。

每次改完 JS/CSS 准备部署时,记得把这几处的 `?v=N` 统一 +1:

```bash
sed -i '' 's/?v=OLD/?v=NEW/g' index.html js/app.js
```

## 本地验证

没有构建步骤,起个静态服务器就能测试(未配置 PAT 时全部走本地模式):

```bash
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/#list
```
