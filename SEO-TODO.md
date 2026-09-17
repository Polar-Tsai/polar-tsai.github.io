# SEO / 站台設定待辦清單

稽核日期：2026-09-04
稽核方式：實際跑 `bun run build`，檢查產出的 `dist/` HTML、sitemap、字體與圖片資產。
下面每一項都附了實際檔案位置，修完打勾即可。

---

## 🔴 嚴重（直接影響排名與收錄）

### [x] 1. 字體 subset 檔案不存在 → 每位訪客下載 6.5MB 字體

> ✅ 2026-09-14：改用霞鶩文楷 TC（`@fontsource/lxgw-wenkai-tc`，unicode-range 切片），不再需要 subset 與完整字體檔。

**現況**
`src/components/BaseHead.astro:104` 的 `@font-face` 指向 `/fonts/ChillRoundM-ui-subset.woff2`，但這個檔案 **不存在**（`public/fonts/` 和 `dist/fonts/` 都沒有）。

原因是產生它的 script 從來沒被執行過：

- `package.json` 的 `build` 只有 `astro build`，沒有 prebuild hook
- `.github/workflows/deploy-pages.yml:35` 有「Install font subsetting tools」步驟（裝了 fonttools + brotli，顯然本來就打算要跑），但整份 workflow 從沒呼叫 `bun run fonts:ui`

**後果**：subset 檔 404 → 瀏覽器回退去抓 6.5MB 未壓縮 TTF。Core Web Vitals 是 Google 明確的排名因素，這是目前最傷排名的一項。

**建議修法**

- 在 `package.json` 加 prebuild hook，或把 `build` 改成 `bun run fonts:ui && astro build`
- 同時在 `deploy-pages.yml` 的 Build 步驟前加上 `bun run fonts:ui`
- 修完後確認 `dist/fonts/ChillRoundM-ui-subset.woff2` 真的有產出

---

### [x] 2. `<html lang="en">` 但全站是繁體中文

> ✅ 2026-09-14：`site.toml` 改為 `lang = "zh-TW"`，UI 一併改用繁中。

**現況**：`src/config/site.toml:15` 設 `lang = "en"`，產出的 HTML 就是 `<html lang="en">`。

**後果**：影響搜尋引擎語言判定、AI 摘要工具、螢幕閱讀器發音。

**⚠️ 要注意的 tradeoff**：這個設定 **同時控制 UI 文字語言**。改成 `zh-TW` 會讓導覽列、「Writing notes」等介面文字一起變中文（`src/i18n/zh-TW.json` 已存在可用）。

如果想保留英文 UI 但修正 `lang`，就需要改成讓 `<html lang>` 和 UI 語言分開設定（要動 `src/utils/ui-text.ts` 的 `getHtmlLang`）。**這是一個需要先決定的問題。**

---

### [x] 3. 25.5MB 沒用到的字體被部署上線

> ✅ 2026-09-14：已刪除 `ChillRoundM.ttf`、`LXGWWenKai-Regular.ttf` 與預覽頁，`public/fonts/` 只剩程式碼字體 `Monaco.ttf`。

**現況**：`public/fonts/LXGWWenKai-Regular.ttf` 有 25.5MB，但 `site.toml` 用的是 ChillRoundM，這個檔案完全沒被任何 `@font-face` 引用。

`dist` 總共 52MB，其中 32MB 是字體。

**建議修法**：確認不會換字體的話直接刪掉；想保留選項的話移出 `public/`（`public/` 底下的檔案一律會被部署）。

---

### [x] 4. `/about` 與 `/projects` 是模板佔位文字，且已進 sitemap

> ✅ 2026-09-14：About 已寫第一版，description 也已改寫。Projects 的 `draft: true` 對 index 頁無效，改成在 `navfolio.config.ts` 停用 projects 模組。

**現況**

- `src/content/about.mdx`：內容是「在這裡寫你的自我介紹」、「技能一」、「技能二」，Email 和 GitHub 欄位都是空的。meta description 是 **「一句話介紹自己」**
- `src/content/projects/index.mdx`：「這裡簡單介紹一下你的專案頁面主旨…」，description 是「這裡放我做過的專案」

**後果**：About 頁是 E-E-A-T（專業性／可信度）最關鍵的信任頁之一，目前的內容等於告訴 Google 這站沒人維護。

---

### [x] 5. `/vibe` 和 `/media` 是空頁面但進了 sitemap

> ✅ 2026-09-14：已在 `navfolio.config.ts` 停用，導覽列連結自動隱藏、sitemap 已移除。

**現況**：`navfolio.config.ts:7` 啟用了 vibe 與 media 模組，但 `src/content/vibe`、`src/content/media` 資料夾不存在（build 會噴 warning）。這兩個空殼頁面照樣產出、也被寫進 sitemap。

另外 `/media` 的標題是 **簡體**「书影音」、描述也是簡體（`site.toml:88-90`）。

**建議修法**：二選一

- 短期：在 `navfolio.config.ts` 關掉這兩個模組
- 長期：真的要用就補內容，並把 `site.toml` 的簡體文案改成繁體

---

## 🟠 中等

### [x] 6. 文章頁的 `<title>` 沒有站名後綴

> ✅ 2026-09-14：`src/layouts/BlogArticle.astro` 改為 ``title={`${title} | ${siteConfig.site.title}`}``。文章頁與 About 頁現在都會帶「| PolarVista」。
>
> **說明**：`<title>` 是瀏覽器分頁文字，也是 Google 搜尋結果的藍色大標題。Google 約顯示 30 個中文字，超過會截斷，但站名放在最後，截掉也不影響文章標題本身。

| 頁面      | 目前 title                          |
| --------- | ----------------------------------- |
| 文章頁    | `非資工也能架設網站！…`（沒有站名） |
| /about    | `關於我`（沒有站名）                |
| /projects | `Projects`（沒有站名）              |
| /blog     | `Writing notes \| PolarVista` ✓     |

最需要品牌背書的文章頁反而沒有站名，SERP 上品牌露出不一致。

---

### [x] 7. 五個分類／標籤頁共用同一段 meta description

> ✅ 2026-09-14：分類、標籤、系列頁改為兩層機制（`src/utils/group-description.ts`）：
>
> 1. **有手寫就用手寫**：`site.toml` 的 `[config.descriptions.categories]`／`tags`／`series`
> 2. **沒寫就自動產生**：例如「「開發日記」標籤收錄 1 篇文章：非資工也能架設網站！…」
>
> ✅ 2026-09-14：已在 `site.toml` 手寫 onsite / life / money / civic 四個分類與 開發日記 / 非資工人 / 職涯 三個標籤的描述。新增分類或標籤時記得回來補一句（寫法如下）：
>
> ```toml
> [config.descriptions.categories]
> onsite = "第一線工作現場的觀察與問題解決紀錄"
> life = "..."
>
> [config.descriptions.tags]
> "開發日記" = "非資工背景自學開發、架站過程的踩坑紀錄"
> "非資工人" = "..."
> "職涯" = "..."
> ```
>
> 不寫也不會重複，只是自動產生的描述比較像目錄；手寫的更能吸引點擊。

`/blog/categories/life/`、`/blog/categories/onsite/`、`/tags/職涯/`、`/tags/開發日記/`、`/tags/非資工人/` 的 description 全是站台預設的「喜歡觀察生活事物…」。

重複 meta description 是 Google Search Console 會直接點名的問題。

---

### [x] 8. `/blog/series/` 抓錯設定，跟 `/blog` 完全重複

> ✅ 2026-09-14：改為 `pages.blog.series`，title 變成「Series | PolarVista」，description 也改用系列頁自己的文案。

**現況**：`src/pages/blog/series/index.astro:16` 寫的是 `pages.blog` 而不是 `pages.blog.series`，導致 title 變成「Writing notes | PolarVista」——**跟 `/blog` 一模一樣**，description 也錯拿 blog 的。

這是模板本身的 bug，改一行即可。

---

### [x] 9. 缺少 `og:site_name` 和 `og:locale`

> ✅ 2026-09-14：`BaseHead.astro` 補上 `og:site_name`（取 `site.title`）與 `og:locale`（依 `theme.lang` 自動轉成 `zh_TW`）。
>
> **說明**：把連結貼到 Facebook、LINE、LinkedIn、Discord 時跳出的預覽卡片，內容來自 `og:` 開頭的標籤。`og:site_name` 讓卡片顯示「PolarVista」而不是只有網址；`og:locale` 告訴平台這頁是台灣繁中。注意 og 的格式是底線 `zh_TW`，跟 `<html lang="zh-TW">` 的連字號不同。

`src/components/BaseHead.astro:209-221` 有 og:type / url / title / description / image，但缺 `og:site_name`（分享卡片不顯示站名）與 `og:locale`（沒宣告 zh_TW）。

---

### [x] 10. OG 圖 1.4MB 且比例錯誤

> ✅ 2026-09-14：製作規範已寫進 `WRITING.md` 的「封面圖（cover）製作注意事項」。兩篇文章的 cover 已重新輸出為 1733×907（1.91:1）的 `cover.jpg`（266KB／279KB），frontmatter 的 `heroImage` 改指向 `.jpg`；`cover.png` 為保留的原檔，未被引用、不會部署。

**現況**：兩篇文章的 `cover.png` 都是 **1448×1086（4:3）**，但社群平台要的是 1.91:1（1200×630），會被裁掉上下。而且 `og:image` 指向 **未優化的原始 PNG（1.4MB）**，不是 Astro 產出的 webp。

**建議修法**：cover 改用 1200×630 出圖；若要讓 og:image 走 Astro 優化過的檔案，需要調整 `BaseHead.astro` 取 `.src` 的方式。

---

### [x] 11. 沒有 robots.txt

> ✅ 2026-09-14：建立 `public/robots.txt`，允許所有爬蟲並指向 sitemap。
>
> **說明**：`robots.txt` 是搜尋引擎與 AI 爬蟲來網站時第一個讀的檔案，告訴它們哪裡能抓、網站地圖在哪。沒有它 Google 仍會收錄，但新文章被發現得比較慢。目前設定歡迎所有爬蟲（含 ChatGPT、Claude、Google AI），文章才有機會被 AI 工具讀到並引用；哪天不想被拿去訓練 AI，也是在這個檔案裡擋。

`dist/robots.txt` 不存在。BaseHead 雖然有 `<link rel="sitemap">`，但 robots.txt 才是爬蟲的標準入口。

**建議修法**：在 `public/robots.txt` 建立，內容至少包含 `Sitemap: https://polar-tsai.github.io/sitemap-index.xml`。

---

## 🟡 次要（多為模板殘留）

- [ ] **12.** `site.toml:7` 的 `repository` 仍指向模板作者的 repo `dodolalorc/astro-navfolio` — 每頁導覽列的 GitHub icon（`src/components/blog/BlogTopNav.astro:130`）會把訪客送去別人的專案
- [ ] **13.** `site.toml:122,124` 的 `handle = "@navfolio"`、`email = "hello@navfolio.site"` — 全站作者卡片（`AuthorCard.astro`）與 mailto 連結（`Header.astro:34`）用的是模板假資料
- [ ] **14.** `vercel.json` 的 `buildCommand` 是 `docs:build`，那是模板自己的文件站設定，不是這個部落格
- [ ] **15.** `public/manifest.json` 的 name 仍是 `"navfolio"`；`public/site.webmanifest` 是沒人引用的孤兒檔（內容 `"MyWebSite"`），可刪
- [ ] **16.** 分類命名體系不一致：categories 用英文小寫（`life`、`onsite`），tags 用中文。且 `onsite` 語意不明，SERP 上讀者看不懂
- [ ] **17.** 主要區塊頁的描述是英文：`/blog`「Notes from the margins.」、`/projects`「Small tools and site systems.」、`/vibe`「Life and coding fragments.」——中文站的門面頁用英文描述，等於放棄中文搜尋流量
- [ ] **18.** `src/content/blog/build-blog-something-need-to-know.md:74` 的圖片 alt 含多餘引號：`!["部落格路徑"](...)` 產出 `alt="&quot;部落格路徑&quot;"`，把引號拿掉即可
- [ ] **19.** JSON-LD 的 author / publisher 是 `polarvista`（全小寫，來自 `site.toml:121`），跟品牌 `PolarVista` 不一致，影響 Google 對 Person 實體的識別一致性

---

## 目前進度（2026-09-14）

- ✅ 已完成：1–11
- ⏳ 尚未開始：12–19（多為模板殘留，改動都很小）

## 相關文件

- 寫文章流程與 frontmatter 說明：`WRITING.md`
- 分析工具（GA4、Clarity、Search Console、Bing）申請與設定：`ANALYTICS.md`
