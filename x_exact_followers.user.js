// ==UserScript==
// @name         X Exact Followers
// @namespace    local.x-exact-followers
// @version      0.7.0
// @description  Replace abbreviated X/Twitter follower counts with exact counts on profile pages.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const OPERATION_NAME = "UserByScreenName";
  const DEFAULT_QUERY_ID = "681MIj51w00Aj6dY0GXnHw";
  const PUBLIC_BEARER =
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D" +
    "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const DEFAULT_FEATURE_SWITCHES = [
    "hidden_profile_subscriptions_enabled",
    "profile_label_improvements_pcf_label_in_post_enabled",
    "responsive_web_profile_redirect_enabled",
    "rweb_tipjar_consumption_enabled",
    "verified_phone_label_enabled",
    "subscriptions_verification_info_is_identity_verified_enabled",
    "subscriptions_verification_info_verified_since_enabled",
    "highlights_tweets_tab_ui_enabled",
    "responsive_web_twitter_article_notes_tab_enabled",
    "subscriptions_feature_can_gift_premium",
    "creator_subscriptions_tweet_preview_api_enabled",
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled",
    "responsive_web_graphql_timeline_navigation_enabled",
  ];
  const DEFAULT_FIELD_TOGGLES = ["withPayments", "withAuxiliaryUserLabels"];

  const state = {
    byScreenName: new Map(),
    authHeader: "",
    queryId: DEFAULT_QUERY_ID,
    featureSwitches: DEFAULT_FEATURE_SWITCHES,
    fieldToggles: DEFAULT_FIELD_TOGGLES,
    lastScreenName: "",
    inFlight: new Set(),
  };
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  function log(...args) {
    console.log("[X Exact Followers]", ...args);
  }

  function randomHex(bytes) {
    const values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function headersObject(headersLike) {
    try {
      const out = {};
      new Headers(headersLike || {}).forEach((value, key) => {
        out[key.toLowerCase()] = value;
      });
      return out;
    } catch (_) {
      return {};
    }
  }

  function captureHeaders(input, init) {
    const headers = headersObject((init && init.headers) || (input && input.headers));
    if (headers.authorization) state.authHeader = headers.authorization;
  }

  function readResponse(url, response) {
    if (!String(url).includes("/graphql/") || !String(url).includes(OPERATION_NAME)) return;
    response.clone().text().then(rememberFromText).catch(() => {});
  }

  function hookNetwork() {
    if (pageWindow.__xExactFollowersHooked) return;
    pageWindow.__xExactFollowersHooked = true;

    const originalPageFetch = pageWindow.fetch?.bind(pageWindow);
    if (originalPageFetch) {
      pageWindow.fetch = function patchedFetch(input, init) {
        captureHeaders(input, init);
        const url = String((input && input.url) || input || "");
        return originalPageFetch(input, init).then((response) => {
          readResponse(url, response);
          return response;
        });
      };
    }

    const OriginalXHR = pageWindow.XMLHttpRequest;
    if (OriginalXHR) {
      pageWindow.XMLHttpRequest = function PatchedXMLHttpRequest() {
        const xhr = new OriginalXHR();
        let url = "";
        const open = xhr.open;
        const setRequestHeader = xhr.setRequestHeader;
        xhr.open = function patchedOpen(method, requestUrl) {
          url = String(requestUrl || "");
          return open.apply(xhr, arguments);
        };
        xhr.setRequestHeader = function patchedSetRequestHeader(name, value) {
          if (String(name).toLowerCase() === "authorization") state.authHeader = String(value);
          return setRequestHeader.apply(xhr, arguments);
        };
        xhr.addEventListener("load", () => {
          if (url.includes("/graphql/") && url.includes(OPERATION_NAME)) {
            rememberFromText(xhr.responseText || "");
          }
        });
        return xhr;
      };
    }
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[2]) : "";
  }

  function getProfileScreenName() {
    const path = location.pathname.split("/").filter(Boolean);
    if (path.length !== 1) return "";
    const name = path[0];
    if (!/^[A-Za-z0-9_]{1,26}$/.test(name)) return "";
    if (/^(home|explore|notifications|messages|settings|i|search|compose|jobs)$/i.test(name)) return "";
    return name;
  }

  function getUserFromPayload(payload) {
    return payload?.data?.user?.result || payload?.data?.user_result?.result || null;
  }

  function getLegacyUser(user) {
    if (!user || user.__typename !== "User") return null;
    return user.legacy || null;
  }

  function findFirstNumberByKey(value, keyPattern, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8) return null;
    for (const [key, child] of Object.entries(value)) {
      if (keyPattern.test(key) && Number.isFinite(Number(child))) return Number(child);
    }
    for (const child of Object.values(value)) {
      const found = findFirstNumberByKey(child, keyPattern, depth + 1);
      if (Number.isFinite(found)) return found;
    }
    return null;
  }

  function findFollowerCount(value, path = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > 10) return null;

    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      const nextPath = path.concat(lowerKey);
      const numeric = Number(child);

      if (
        Number.isFinite(numeric) &&
        (
          lowerKey === "followers" ||
          lowerKey === "followers_count" ||
          lowerKey === "normal_followers_count" ||
          (nextPath.some((part) => part.includes("followers")) && /^(count|total|value)$/.test(lowerKey))
        )
      ) {
        return numeric;
      }

      if (child && typeof child === "object") {
        const found = findFollowerCount(child, nextPath, depth + 1);
        if (Number.isFinite(found)) return found;
      }
    }

    return null;
  }

  function readExactFollowers(payload) {
    const user = getUserFromPayload(payload);
    if (!user || user.__typename !== "User") return null;
    const legacy = getLegacyUser(user);
    const count =
      (Number.isFinite(Number(legacy?.normal_followers_count)) ? Number(legacy?.normal_followers_count) : null) ??
      (Number.isFinite(Number(legacy?.followers_count)) ? Number(legacy?.followers_count) : null) ??
      findFirstNumberByKey(user, /^(normal_)?followers_count$/) ??
      findFollowerCount(user);
    const screenName = legacy?.screen_name || legacy?.screenName || user.core?.screen_name || user.core?.screenName;
    if (!Number.isFinite(count) || !screenName) return null;
    return { screenName, count };
  }

  function rememberFromPayload(payload) {
    const exact = readExactFollowers(payload);
    if (!exact) return false;
    state.byScreenName.set(exact.screenName.toLowerCase(), exact.count);
    log("exact count", exact.screenName, exact.count);
    replaceFromCache();
    return true;
  }

  function collectFollowHints(value, path = [], depth = 0, output = []) {
    if (!value || typeof value !== "object" || depth > 7 || output.length > 40) return output;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path.concat(key);
      if (/follow/i.test(key) || nextPath.some((part) => /follow/i.test(part))) {
        if (child == null || typeof child !== "object") {
          output.push(`${nextPath.join(".")}=${JSON.stringify(child)}`);
        }
      }
      if (child && typeof child === "object") collectFollowHints(child, nextPath, depth + 1, output);
    }
    return output;
  }

  function rememberFromText(text) {
    if (!text) return false;
    try {
      return rememberFromPayload(JSON.parse(text));
    } catch (_) {
      return false;
    }
  }

  const originalFetch = pageWindow.fetch?.bind(pageWindow) || window.fetch?.bind(window);

  function buildFeatures() {
    return Object.fromEntries(state.featureSwitches.map((key) => [key, true]));
  }

  function buildFieldToggles() {
    return Object.fromEntries(state.fieldToggles.map((key) => [key, true]));
  }

  async function refreshQueryMetadata() {
    const scripts = Array.from(document.scripts)
      .map((script) => script.src)
      .filter((src) => src && src.includes("abs.twimg.com/responsive-web/client-web/"));
    const candidates = scripts.filter((src) => /main|UserProfile|Routes/.test(src)).concat(scripts);
    for (const src of [...new Set(candidates)]) {
      try {
        const text = await originalFetch(src, { credentials: "omit" }).then((response) => response.text());
        const idx = text.indexOf(`operationName:"${OPERATION_NAME}"`);
        if (idx < 0) continue;
        const blockStart = Math.max(0, text.lastIndexOf("e.exports=", idx));
        const blockEndRaw = text.indexOf("}}}", idx);
        const blockEnd = blockEndRaw > idx ? blockEndRaw + 3 : Math.min(text.length, idx + 2500);
        const block = text.slice(blockStart, blockEnd);
        const queryId = block.match(/queryId:"([^"]+)"/)?.[1];
        const featureText = block.match(/featureSwitches:\[([^\]]*)\]/)?.[1] || "";
        const toggleText = block.match(/fieldToggles:\[([^\]]*)\]/)?.[1] || "";
        const features = Array.from(featureText.matchAll(/"([^"]+)"/g), (match) => match[1]);
        const toggles = Array.from(toggleText.matchAll(/"([^"]+)"/g), (match) => match[1]);
        if (queryId) state.queryId = queryId;
        if (features.length) state.featureSwitches = features;
        if (toggles.length) state.fieldToggles = toggles;
        log("query metadata", state.queryId);
        return;
      } catch (_) {}
    }
  }

  async function fetchExactFollowers(screenName) {
    if (!screenName) return;
    const key = screenName.toLowerCase();
    if (!originalFetch || state.inFlight.has(key)) return;
    state.inFlight.add(key);
    try {
      if (!state.authHeader) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const variables = {
        screen_name: screenName,
        withSafetyModeUserFields: true,
      };
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(buildFeatures()),
        fieldToggles: JSON.stringify(buildFieldToggles()),
      });
      const endpoint = `https://${location.hostname}/i/api/graphql/${state.queryId}/${OPERATION_NAME}?${params}`;
      const ct0 = getCookie("ct0");
      const headers = {
        accept: "*/*",
        authorization: state.authHeader || PUBLIC_BEARER,
        "x-client-transaction-id": randomHex(16),
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": navigator.language.split("-")[0] || "en",
      };
      if (ct0) headers["x-csrf-token"] = ct0;
      log("request", screenName, "queryId", state.queryId, "ct0", ct0 ? "yes" : "no", "capturedAuth", state.authHeader ? "yes" : "no");
      const response = await originalFetch(endpoint, { credentials: "include", headers });
      const text = await response.text();
      if (!response.ok) {
        log("API failed", response.status, text.slice(0, 300));
        return;
      }
      if (!rememberFromText(text)) {
        try {
          log("API returned but parse did not find followers", collectFollowHints(JSON.parse(text)).join(" | "), text.slice(0, 200));
        } catch (_) {
          log("API returned but parse did not find followers", text.slice(0, 300));
        }
      }
    } catch (error) {
      log("fetch failed", error);
    } finally {
      state.inFlight.delete(key);
    }
  }

  function exactText(count) {
    return new Intl.NumberFormat(navigator.language || "en-US").format(count);
  }

  function isFollowerLabel(text) {
    return /^(Followers|Follower|关注者|粉丝|フォロワー|팔로워|Seguidores|Abonnés|Follower:innen)$/i.test(text.trim());
  }

  function isCompactNumber(text) {
    return /^[\d\s,.]+(?:[KMB]|万|億|千|百万|亿)?$/i.test(text.trim());
  }

  function getFollowersLinks(screenName) {
    const profile = screenName.toLowerCase();
    return Array.from(document.querySelectorAll('a[href]')).filter((link) => {
      try {
        const url = new URL(link.href, location.href);
        const parts = url.pathname.split("/").filter(Boolean);
        return (
          parts.length === 2 &&
          parts[0].toLowerCase() === profile &&
          (parts[1] === "verified_followers" || parts[1] === "followers")
        );
      } catch (_) {
        return false;
      }
    });
  }

  function findNumberSpanLikeStaticPage(link) {
    const spans = Array.from(link.querySelectorAll("span"));
    const leafSpans = spans.filter((span) => !span.querySelector("span"));

    // Static X profile HTML shape:
    // <a href="/NozomiNirei/verified_followers">
    //   <span><span>5.9万</span></span>
    //   <span><span>关注者</span></span>
    // </a>
    const labelIndex = leafSpans.findIndex((span) => isFollowerLabel(span.textContent || ""));
    if (labelIndex > 0) {
      for (let index = labelIndex - 1; index >= 0; index -= 1) {
        const span = leafSpans[index];
        if (isCompactNumber(span.textContent || "")) return span;
      }
    }

    return leafSpans.find((span) => isCompactNumber(span.textContent || "")) || null;
  }

  function replaceFollowerCount(count) {
    const screenName = getProfileScreenName();
    if (!screenName) return;
    const text = exactText(count);
    const links = getFollowersLinks(screenName);
    if (!links.length) log("followers link not found for", screenName);
    for (const link of links) {
      const numberSpan = findNumberSpanLikeStaticPage(link);
      if (!numberSpan || numberSpan.textContent === text) continue;
      numberSpan.textContent = text;
      numberSpan.title = String(count);
      link.setAttribute("data-exact-followers", String(count));
      log("replaced", count);
    }
  }

  function replaceFromCache() {
    const screenName = getProfileScreenName();
    if (!screenName) return;
    if (screenName !== state.lastScreenName) {
      state.lastScreenName = screenName;
      setTimeout(() => fetchExactFollowers(screenName), 500);
      setTimeout(() => fetchExactFollowers(screenName), 2500);
    }
    const count = state.byScreenName.get(screenName.toLowerCase());
    if (Number.isFinite(count)) replaceFollowerCount(count);
  }

  function parseJsonLdFallback() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        const entity = data.mainEntity;
        const screenName = entity?.additionalName;
        const followStat = entity?.interactionStatistic?.find((item) => item?.name === "Follows");
        const count = Number(followStat?.userInteractionCount);
        if (screenName && Number.isFinite(count)) {
          state.byScreenName.set(screenName.toLowerCase(), count);
        }
      } catch (_) {}
    }
  }

  function boot() {
    parseJsonLdFallback();
    refreshQueryMetadata().then(() => fetchExactFollowers(getProfileScreenName()));
    replaceFromCache();
    const observer = new MutationObserver(replaceFromCache);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(replaceFromCache, 2000);
  }

  hookNetwork();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
