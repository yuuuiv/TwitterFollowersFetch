# X Exact Followers

<p align="center"><b><a href="README.md">English</a> | <a href="README_ZH.md">简体中文</a></b></p>

X Exact Followers is a Tampermonkey userscript that replaces abbreviated follower counts on X/Twitter profile pages with exact counts.

## Features

- Runs on `https://x.com/*` and `https://twitter.com/*`.
- Uses the current browser session to call X's web GraphQL `UserByScreenName` endpoint.
- Extracts the exact follower count from the returned user payload.
- Replaces the rounded count in the profile stats row.
- Tries to discover the current GraphQL query id from X's loaded JavaScript.

## Installation

Install from Greasy Fork:

<https://greasyfork.org/zh-CN/scripts/582743-x-exact-followers>

Or install manually:

1. Install Tampermonkey in your browser.
2. Create a new userscript.
3. Copy the full contents of `x_exact_followers.user.js` into Tampermonkey.
4. Save the script.
5. Open an X profile page.
6. If the page was already open, force refresh with `Ctrl+F5`.

The script header should include:

```js
// @grant        unsafeWindow
// @license      MIT
```

## Debugging

Open DevTools Console and filter for:

```text
[X Exact Followers]
```

Useful messages:

- `query metadata ...`: the current X GraphQL query id was found.
- `request ... ct0 yes capturedAuth yes`: the request is using session cookies and captured auth.
- `exact count ...`: the exact follower count was parsed successfully.
- `replaced ...`: the visible follower count was replaced.
- `followers link not found ...`: the DOM selector did not find the profile follower link.
- `API returned but parse did not find followers ...`: X changed the response shape; use the printed follow-related field paths to update the parser.

Messages such as `securepubads... ERR_BLOCKED_BY_CLIENT`, `ads-api.x.com ... 503`, or `Banner not shown` are unrelated to this script.

## Notes

X frequently changes internal GraphQL response shapes and operation ids. This script includes dynamic query-id discovery and fallback parsing, but it may still need updates when X changes fields.

## License

This project is licensed under the [MIT License](LICENSE).
