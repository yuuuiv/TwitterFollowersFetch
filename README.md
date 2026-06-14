# X Exact Followers

Tampermonkey userscript for replacing abbreviated X/Twitter profile follower counts, such as `5.9万`, with exact counts.

## What It Does

On X profile pages, the public UI often shows rounded follower counts. This script:

- Runs on `https://x.com/*` and `https://twitter.com/*`.
- Calls X's web GraphQL `UserByScreenName` endpoint using the current browser login session.
- Extracts the exact follower count from the returned user payload.
- Replaces the follower count shown in the profile stats row.

## Files

- `x_exact_followers.user.js`: Tampermonkey script.

## Installation

1. Install Tampermonkey in your browser.
2. Create a new userscript.
3. Copy the full contents of `x_exact_followers.user.js` into Tampermonkey.
4. Save the script.
5. Open an X profile page
6. Use `Ctrl+F5` to force refresh if the page was already open.

Confirm the script header contains:

```js
// @version      0.7.0
// @grant        unsafeWindow
```

## Debugging

Open DevTools Console and filter for:

```text
[X Exact Followers]
```

Useful log messages:

- `query metadata ...`: found the current X GraphQL query id.
- `request ... ct0 yes capturedAuth yes`: request is being sent with session cookies and captured auth.
- `exact count ...`: exact follower count was parsed successfully.
- `replaced ...`: the visible profile follower count was replaced.
- `followers link not found ...`: DOM selector did not find the profile follower link.
- `API returned but parse did not find followers ...`: X changed the response shape; use the printed follow-related field paths to update the parser.

Browser messages such as `securepubads... ERR_BLOCKED_BY_CLIENT`, `ads-api.x.com ... 503`, or `Banner not shown` are unrelated to this script.

## Notes

X frequently changes internal GraphQL response shapes and operation ids. The script tries to discover the current `UserByScreenName` query id from loaded X JavaScript and includes fallback parsing, but it may still need small updates when X changes fields.