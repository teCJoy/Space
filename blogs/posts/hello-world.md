# Blog Feature Test

This post demonstrates various enhanced features supported by the blog.

## 1. Table

| Feature       | Support | Notes                  |
|---------------|---------|------------------------|
| Table         | Yes     | Native Markdown        |
| Math formula  | Yes     | KaTeX rendering        |
| B站视频        | Yes     | iframe embed           |
| Mermaid chart | Yes     | pie chart example below|

## 2. Math Formula (Inline & Block)

Inline: $E = mc^2$

Block formula:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## 3. Bilibili Video Embed

Replace `VIDEO_ID` with actual ID. Example (using a placeholder):

```html
<iframe src="https://player.bilibili.com/player.html?aid=VIDEO_ID&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width:100%; height:360px;"></iframe>
