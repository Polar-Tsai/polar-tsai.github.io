# 寫文章 SOP

每次要發一篇新的 blog 文章時，照這份清單走一遍。

## 1. 建立文章檔案

```bash
bun run post:new <slug>
```

- `<slug>` 用英文/拼音、空白會自動轉成 `-`，會產生 `src/content/blog/<slug>.md`。
- 想要 `.mdx`（需要用到互動元件時）就加 `--mdx`：`bun run post:new <slug> --mdx`。
- 若檔案已存在會直接報錯，不會覆蓋。

## 2. 填 frontmatter

新檔案會帶出模板欄位，逐一確認：

| 欄位                             | 說明                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                          | 文章標題                                                                                                                                                      |
| `description`                    | 摘要，會用在 `<meta description>`、OG/Twitter 卡片、RSS。建議一兩句話講清楚文章在說什麼                                                                       |
| `author`                         | **留空**即可，會自動 fallback 成 `site.toml` 的 `profile.name`；只有代筆/共筆才需要填                                                                         |
| `date`                           | 發布日（模板已自動帶入當下時間）                                                                                                                              |
| `updatedDate`                    | 之後回來大改內容時才補，會顯示在日期後面，也會寫進 `article:modified_time` 與 JSON-LD `dateModified`，是重要的新鮮度訊號                                      |
| `draft`                          | 寫作中設 `true`；確定要上線再改成 `false`                                                                                                                     |
| `sticky`                         | 要不要置頂                                                                                                                                                    |
| `heroImage`                      | 文章首圖，路徑寫法見下面「圖片歸檔」章節                                                                                                                      |
| `showHeroImage`                  | 是否在文章頁顯示首圖                                                                                                                                          |
| `ogImage`                        | 社群分享卡片用的圖，留空會 fallback 用 `heroImage`，兩者都空才用全站預設圖；**每篇文章的分享圖最好不一樣**，避免全站分享出去都是同一張圖                      |
| `canonicalUrl`                   | **只有**這篇文章「同時/曾經發在別的平台」才填那個原始網址，會覆蓋這頁的 canonical，告訴搜尋引擎正本在那邊。純原創、只發這裡的文章留空即可                     |
| `tags` / `categories` / `series` | 分類用，會出現在 tag 頁、分類頁、系列頁                                                                                                                       |
| `comments`                       | 這篇要不要開留言                                                                                                                                              |
| `sidebar.toc`                    | 目錄開關。**建議保持開啟**——AI 摘要工具（Google AI Overview、Perplexity 等）很依賴標題階層去抓「這段在回答什麼問題」，但前提是正文要搭配 H2/H3，光開 toc 沒用 |
| `sidebar.relatedPosts`           | 相關文章推薦開關                                                                                                                                              |

## 3. 圖片歸檔

縮圖（`heroImage` / `ogImage`）跟內文圖片**放在同一個地方**，用「每篇文章一個資料夾」歸檔，不要全部丟進同一個大資料夾：

```
src/assets/figure/blog/<slug>/
  cover.png       ← 縮圖 / heroImage（同時當 ogImage 的來源也可以）
  01-xxx.png       ← 內文用的截圖、示意圖，依出現順序編號
  02-xxx.png
```

- `<slug>` 跟文章檔名（`src/content/blog/<slug>.md`）取一樣的名字，之後要找哪篇文章的圖一看資料夾名稱就知道。
- frontmatter 用**相對路徑**指到這個資料夾：
  ```yaml
  heroImage: '../../assets/figure/blog/<slug>/cover.png'
  ogImage: '../../assets/figure/blog/<slug>/cover.png' # 想用不同構圖也可以另外放一張
  ```
  （相對路徑是從 `src/content/blog/<slug>.md` 這個檔案往上算：`../../` 回到 `src/`，再進 `assets/figure/blog/<slug>/`。）
- 內文插圖也用同一個資料夾、同樣的相對路徑寫法：
  ```markdown
  ![截圖說明](../../assets/figure/blog/<slug>/01-xxx.png)
  ```
- **不要**放進 `public/`：`public/` 底下的檔案不會經過 Astro 的圖片優化（不會自動轉 webp/avif、不會依裝置縮放），只有放在 `src/assets/` 才會被 `heroImage`/`ogImage` 的 schema 接受並優化。`public/` 保留給 favicon、manifest 這類「必須固定網址、不需要優化」的靜態檔。
- 外部圖床/CDN 圖片也可以，直接填完整的 `https://` 網址即可（會被當成 remote image，不經過本地優化）。
- OG 圖建議用 **1200×630** 左右的比例，社群平台預覽卡片才不會被裁切奇怪。

## 4. 寫正文

- 用 `# 標題` 起手後，內文段落用 **H2 / H3**（`##`、`###`）分段，不要整篇只有一層標題或用粗體假裝標題——這會直接影響 TOC 品質跟 AI 摘要抓取效果。
- 圖片、連結照一般 Markdown 語法即可（見上一節的路徑寫法），`.mdx` 才能用 `@navfolio/mdx-components` 提供的互動元件。

## 5. 本地預覽

```bash
bun run dev
```

打開對應的 `/blog/<slug>/` 路徑，確認：

- 首圖/OG 圖有沒有跑版
- TOC 有沒有正確抓到標題階層
- tags / categories / series 連結有沒有連到對的分類頁

## 6. 檢查格式

```bash
bun run format:check
```

有問題的話用 `bun run format` 自動修。

## 7. 發布

1. 把 `draft` 改成 `false`（如果還沒改）。
2. `git add`、commit、push（或依你平常的流程開 PR）。
3. 之後若回來做重大修改，記得補上/更新 `updatedDate`。

## 發文前 SEO/AEO 檢查表

- [ ] `description` 有寫，且能單獨概括文章重點（會被搜尋引擎與 AI 摘要工具直接引用）
- [ ] 有設定 `ogImage`（或至少有 `heroImage` 可 fallback），且**不是跟其他文章共用同一張圖**
- [ ] 正文有用 H2/H3 分段，不是整篇平舖直敘
- [ ] `tags` / `categories` 有填，且跟既有分類一致（可先看 `/blog/categories`、`/blog/tags` 有哪些既有分類，避免同義詞打散流量）
- [ ] 純原創文章 `canonicalUrl` 留空；轉載/同步發布才填來源網址
- [ ] `draft: false`
