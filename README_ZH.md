# X Exact Followers

<p align="center"><b><a href="README.md">English</a> | <a href="README_ZH.md">简体中文</a></b></p>

X Exact Followers 是一个 Tampermonkey 用户脚本，用于将 X/Twitter 个人资料页中的近似粉丝数替换为精确粉丝数。

## 功能

- 运行在 `https://x.com/*` 和 `https://twitter.com/*`。
- 使用当前浏览器登录会话调用 X 网页版 GraphQL `UserByScreenName` 接口。
- 从返回的用户数据中提取精确粉丝数。
- 替换个人资料统计行中的圆整粉丝数。
- 尝试从 X 已加载的 JavaScript 中动态发现当前 GraphQL query id。

## 安装

从 Greasy Fork 安装：

<https://greasyfork.org/zh-CN/scripts/582743-x-exact-followers>

或手动安装：

1. 在浏览器中安装 Tampermonkey。
2. 创建一个新的用户脚本。
3. 将 `x_exact_followers.user.js` 的完整内容复制到 Tampermonkey。
4. 保存脚本。
5. 打开任意 X 个人资料页。
6. 如果页面已经打开，请使用 `Ctrl+F5` 强制刷新。

脚本头部应包含：

```js
// @grant        unsafeWindow
// @license      MIT
```

## 调试

打开浏览器开发者工具的 Console，并筛选：

```text
[X Exact Followers]
```

常见日志：

- `query metadata ...`：已找到当前 X GraphQL query id。
- `request ... ct0 yes capturedAuth yes`：请求正在使用会话 cookie 和捕获到的认证信息。
- `exact count ...`：已成功解析精确粉丝数。
- `replaced ...`：已替换页面上显示的粉丝数。
- `followers link not found ...`：DOM 选择器没有找到个人资料页的粉丝链接。
- `API returned but parse did not find followers ...`：X 更改了响应结构，可根据打印出的 follow 相关字段路径更新解析逻辑。

类似 `securepubads... ERR_BLOCKED_BY_CLIENT`、`ads-api.x.com ... 503` 或 `Banner not shown` 的浏览器信息与脚本无关。

## 注意事项

X 会频繁调整内部 GraphQL 响应结构和 operation id。本脚本包含动态 query id 发现和备用解析逻辑，但当 X 更改字段时，仍可能需要更新。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
