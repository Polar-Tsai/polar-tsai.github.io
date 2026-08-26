---
title: <%= title | yaml %>
description: ''
author: ''                     # 留空會自動用 site.toml 的 profile.name，只有代筆/共筆才需要填
date: <%= isoDate | yaml %>    # 發布日

### Optional
### 會顯示在發布日期後面，並寫進 article:modified_time 與 JSON-LD 的 dateModified，
### 讓讀者與 AI/搜尋引擎判斷新鮮度
updatedDate: ''
draft: true
sticky: false
heroImage: ''
ogImage: ''                    # 社群分享用的預覽圖，留空會自動 fallback 用 heroImage，兩者都沒有才用全站預設圖
showHeroImage: false

### 只有「這篇文章曾經/同時發在別的平台」時才填，
### 填入那個原始網址，會覆蓋這頁的 <link rel="canonical">，告訴搜尋引擎正本在那邊。
### 自己原創、只發在這裡的文章留空即可（會自動指向這頁自己）
canonicalUrl: ''               
tags: []
categories: []
series: []
comments: true
sidebar:
  enable: true
  
  ### TOC 對 AEO 特別關鍵，因為 AI 摘要工具（Google AI Overview、Perplexity 等）很依賴標題階層去切出「這段在回答什麼問題」，
  ### 之後正文一定要搭配 H2/H3 才有用，光開啟 toc 沒用。
  toc: true
  relatedPosts: true
---

# <%= title %>

Start writing here.
