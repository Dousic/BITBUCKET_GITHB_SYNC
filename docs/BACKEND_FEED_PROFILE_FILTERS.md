# Backend spec — Feed, Full Profile, and Home Filters

**For:** Backend / API engineering
**Base URL (all paths below are relative to this):** `https://api.dousic.media/api/webos/v1`
**Auth:** `Authorization: Bearer <access_token>` on every endpoint here (all require a signed‑in user).
**Format:** JSON in, JSON out. CORS + error rules are the same as the main spec
(`docs/API_BACKEND_SPEC.md` §1) — every route needs the `OPTIONS` preflight and
`Access-Control-Allow-Origin: *`.

This document covers **three** things the app already calls but the backend must
implement:

1. **Feed** — `GET /content/feed`
2. **Full Profile** — `GET /user/profile`, `GET /user/followers`, `GET /user/following`
3. **Home filters** — `GET /content/browse?media_type=&genre=&vibe=`

> Field rule for all three: the app reads fields **tolerantly** (aliases listed
> in parentheses), but return the **canonical** (bold) names. Any field marked
> optional can be omitted and the app degrades gracefully. **All image/media
> URLs must be HTTPS** on `*.dousic.media` or `*.dousic-cdn.com` (http:// is
> CSP‑blocked → black tiles).

---

## 1. Feed — `GET /content/feed`

The social feed (dousic.media/feed) shown on the app's **Feed** tab.

### Request
```
GET /content/feed?tab=for_you&genre=&limit=20&cursor=
```
Query params:
| Param | Values | Meaning |
|---|---|---|
| `tab` | `for_you` \| `following` \| `live` \| `local` | **Server‑side filter** of which posts to return (see below). Defaults to `for_you`. |
| `genre` | a genre name or empty | optional secondary filter |
| `limit`, `cursor` | ints / opaque cursor | optional pagination (return a generous first page if you don't page yet) |

`tab` semantics (filter on the server — the app does **not** re‑filter):
- **for_you** — personalized/all recent posts.
- **following** — only posts from creators this user follows.
- **live** — only posts that are currently live (`is_live=true`).
- **local** — posts scoped to the user's region.

### Response `200`
```json
{
  "items": [
    {
      "id": "post_1",
      "content_id": "c_123",
      "creator": {
        "display_name": "Kenny Mo",
        "handle": "kennymo",
        "avatar_url": "https://cdn.dousic-cdn.com/u/kennymo.jpg"
      },
      "meta": "now · Houston, TX",
      "caption": "Friday Night Sessions — multi-cam set, stitched live by AI ⚡",
      "title": "Friday Night Sessions",
      "subtitle": "Live DJ set · 3 cameras",
      "type": "audio",
      "is_live": true,
      "viewer_count": 1240,
      "thumbnail_url": "https://cdn.dousic-cdn.com/posts/c_123.jpg",
      "tag": "Live",
      "likes": 1240,
      "comments": 418
    }
  ]
}
```

### Field table (feed post)
| Field | Type | Req | Notes / aliases |
|---|---|---|---|
| **`id`** | string | ✅ | Unique post id (list key). |
| **`content_id`** | string | ✅ | **What selecting the post opens.** Live → player, else content‑detail page. (aliases: falls back to `id`.) |
| **`creator`** | object | ✅ | `{ display_name, handle, avatar_url }`. (aliases: `author`; may also be a bare string name.) |
| **`caption`** | string | ✅ | Post text. (aliases: `text`, `description`, else `title`.) |
| `title` | string | ○ | Media title shown on the preview. (alias: `track_title`) |
| `subtitle` | string | ○ | e.g. "Single · 3:58". (alias: `duration_label`) |
| **`type`** | string | ✅ | `video` \| `audio` \| `podcast` \| `art` \| … Drives the tag + audio styling. (aliases: `media_type`, `kind`) |
| **`is_live`** | bool | ✅ | Shows the LIVE badge; routes select → player. (alias: `isLive`) |
| `viewer_count` | number | ○ | Shown next to LIVE. (alias: `viewerCount`) |
| **`thumbnail_url`** | https URL | ▲ | 16:9 media preview. (aliases: `cover_url`, `image_url`, `image`, `poster_url`, `backdrop_url`) |
| `meta` | string | ○ | Small line under the name (time · place). (aliases: `posted_at_label`, `timeago`, `time`) |
| `tag` | string | ○ | Pill label. If omitted, the app derives it from `is_live`/`type`. |
| `likes` | number | ○ | (alias: `like_count`) |
| `comments` | number | ○ | (alias: `comment_count`) |

▲ Strongly recommended (a missing image falls back to a brand gradient).

### Laravel
```php
// routes/api.php (already prefixed → /api/webos/v1)
Route::prefix('webos/v1')->middleware(['api','cors','auth:webos'])->group(function () {
    Route::get('/content/feed', [FeedController::class, 'index']);
});

// FeedController@index
public function index(Request $r) {
    $tab = $r->query('tab', 'for_you');
    $q = Post::query()->with('creator')->latest();
    if ($tab === 'following') $q->whereIn('creator_id', $r->user()->followingIds());
    if ($tab === 'live')      $q->where('is_live', true);
    if ($tab === 'local')     $q->where('region', $r->user()->region);
    if ($g = $r->query('genre')) $q->where('genre', $g);
    return response()->json([
        'items' => $q->limit((int)$r->query('limit', 30))->get()->map->toFeedArray(),
    ]);
}
```

---

## 2. Full Profile

### 2.1 `GET /user/profile` — the account view

Returns the complete profile for the **signed‑in** user. Every field is optional;
the app merges this over `/auth/me` and hides sections it has no data for.

#### Response `200`
```json
{
  "display_name": "Kenny Mo",
  "handle": "kennymo",
  "avatar_url": "https://cdn.dousic-cdn.com/u/kennymo.jpg",
  "role": "Singer · Producer",
  "location": "Houston, TX",
  "followers_count": 12400,
  "following_count": 318,
  "bio": "Houston-based artist sharing original tracks and live sessions. 100% owned, 70% to me.",
  "interests": ["🎵 Electronic", "🎧 Lo-fi", "🎬 Short film"],
  "collection": [
    { "id": "col_1", "title": "Neon Delta", "type": "art",
      "thumbnail_url": "https://…", "price": 42.00, "is_free": false }
  ],
  "usage": {
    "storage_used_label": "3 GB", "storage_total_label": "5 GB", "storage_pct": 60,
    "livestream_used_label": "22 min", "livestream_total_label": "60 min", "livestream_pct": 37
  }
}
```

#### Field table
| Field | Type | Notes / aliases |
|---|---|---|
| `display_name`, `handle`, `avatar_url` | string | If omitted, taken from `/auth/me`. |
| `role` | string | Shown under the name in pink. (aliases: `creator_type`, `title`) |
| `location` | string | (alias: `city`) |
| `followers_count` | number | (aliases: `followers`, or `counts.followers`) — app formats 12400 → "12.4K". |
| `following_count` | number | (aliases: `following`, or `counts.following`) |
| `bio` | string | About text. (alias: `about`) |
| `interests` | string[] | Chip labels (emoji ok). |
| `collection` | array | Content items (editions/NFTs) for the **Collection** tab. Same item shape as a card: `{id, title, thumbnail_url, type, price, is_free}`. (accepts a bare array or `{items:[…]}`) |
| `usage.storage_pct` | number (0–100) | Storage bar. **Either** send `storage_pct` directly, **or** send numeric `storage_used`+`storage_total` and the app computes the %. |
| `usage.storage_used_label`, `usage.storage_total_label` | string | Display text on the bar ("3 GB" / "5 GB"). |
| `usage.livestream_pct` / `_used_label` / `_total_label` | number / string | Same, for the Livestreaming bar. |

> The **Content** tab is populated from the existing `GET /user/watchlist` +
> `GET /user/history` (no new endpoint). The **About** tab uses `bio` +
> `interests`. **Collection** uses `usage`‑sibling `collection`. **Followers /
> Following** use the two endpoints below.

### 2.2 `GET /user/followers` and `GET /user/following`
```
GET /user/followers?limit=50&cursor=
GET /user/following?limit=50&cursor=
```
Response `200`:
```json
{
  "items": [
    { "id": "u_9", "display_name": "Lyra V.", "handle": "lyrav",
      "role": "Singer-songwriter",
      "avatar_url": "https://…", "is_following": true }
  ]
}
```
| Field | Type | Notes |
|---|---|---|
| **`id`** | string | list key |
| **`display_name`** | string | (falls back to `handle`) |
| `handle` | string | shown as `@handle` if no `role` |
| `role` | string | small line under the name |
| `avatar_url` | https URL | else a generated gradient initials avatar |
| `is_following` | bool | drives the Follow / Following button label |

### Laravel
```php
Route::get('/user/profile',   [ProfileController::class, 'show']);
Route::get('/user/followers', [ProfileController::class, 'followers']);
Route::get('/user/following', [ProfileController::class, 'following']);
// each returns response()->json([...]) in the shapes above; followers/following
// wrap the list under "items".
```

---

## 3. Home filters — `GET /content/browse?media_type=&genre=&vibe=`

The Home page has three dropdowns (**Media Types · Genres · Vibes**). When the
user picks anything other than "All", the app calls **`/content/browse`** with
the chosen values as query params and shows the returned items as a grid. When
all three are "All", the app shows its curated rails and does **not** call this.

### Request
```
GET /content/browse?media_type=Video&genre=Hip-Hop&vibe=Chill
```
- Only **non‑"All"** axes are sent (e.g. if the user only picks a Media Type,
  just `?media_type=Video` is sent). "All" = that axis is unfiltered.
- **Filter on the server** and return only matching items. Match semantics:
  `(!media_type || item.media_type == media_type) && (!genre || item.genre == genre) && (!vibe || item.vibe == vibe)`.

### Response `200`
```json
{
  "items": [
    {
      "id": "c_501",
      "title": "Sunset Sessions",
      "thumbnail_url": "https://cdn.dousic-cdn.com/c/501.jpg",
      "type": "video",
      "media_type": "Video",
      "genre": "Electronic",
      "vibe": "Mellow",
      "creator": { "display_name": "Kenny Mo", "handle": "kennymo" },
      "duration": 2640,
      "price": 0, "is_free": true,
      "is_live": false
    }
  ],
  "genres": ["Hip-Hop", "R&B", "Electronic"]
}
```
- `items` = standard **content items** (same shape as everywhere else — see main
  spec §4.1: `id, title, thumbnail_url, type, creator, duration, price, is_free,
  is_live`). For filtering to work, each item **must also carry** the three
  taxonomy fields so you can match on them: **`media_type`**, **`genre`**,
  **`vibe`**.
- `genres` is optional (used by the Browse screen, ignored here).

### The exact taxonomy (must match — these are the dropdown values)
```
media_type : All, Video, Audio, Images, Text, Podcast, Radio, Review Shows, Citizen News
genre      : All, Hip-Hop, R&B, Funk, Gospel, Electronic, Indie, World, Talk, Tech, News
vibe       : All, Energetic, Chill, Smooth, Uplifting, Classic, Mellow
```
Store `media_type`, `genre`, `vibe` on each content record using **these exact
strings** (case‑sensitive match). `media_type` is the human label ("Video"),
distinct from the lowercase `type` ("video") used for the card badge — return
both.

### Laravel
```php
Route::get('/content/browse', [ContentController::class, 'browse']);

public function browse(Request $r) {
    $q = Content::query();
    if ($m = $r->query('media_type')) $q->where('media_type', $m); // "Video"
    if ($g = $r->query('genre'))      $q->where('genre', $g);      // "Hip-Hop"
    if ($v = $r->query('vibe'))       $q->where('vibe', $v);       // "Chill"
    return response()->json([
        'items'  => $q->limit(100)->get()->map->toCardArray(),
        'genres' => Content::distinct()->pluck('genre'),
    ]);
}
```

---

## 4. Acceptance tests (run before handing to QA)

```bash
BASE=https://api.dousic.media/api/webos/v1
TOK=<a real access token>

# FEED — each tab returns items; live tab only live posts
for t in for_you following live local; do
  echo "== $t =="; curl -s "$BASE/content/feed?tab=$t" -H "Authorization: Bearer $TOK" \
    | jq '.items[0] | {id, content_id, type, is_live, creator: .creator.handle}'
done

# PROFILE — full object + people lists
curl -s "$BASE/user/profile"   -H "Authorization: Bearer $TOK" | jq '{role, location, followers_count, usage}'
curl -s "$BASE/user/followers" -H "Authorization: Bearer $TOK" | jq '.items[0]'
curl -s "$BASE/user/following" -H "Authorization: Bearer $TOK" | jq '.items[0]'

# FILTERS — server-side filtering by the three axes
curl -s "$BASE/content/browse?media_type=Video"            -H "Authorization: Bearer $TOK" | jq '.items | length, (.[0]|{media_type,type})'
curl -s "$BASE/content/browse?genre=Hip-Hop&vibe=Chill"    -H "Authorization: Bearer $TOK" | jq '.items[] | {title, genre, vibe}'
```

**Pass criteria**
- [ ] `GET /content/feed?tab=…` filters server‑side (following=followed only, live=live only, local=region); each item has `content_id`, `creator`, `type`, `is_live`, HTTPS `thumbnail_url`.
- [ ] `GET /user/profile` returns `role`/`location`/`followers_count`/`bio`/`interests`/`usage` (any subset); `usage` has either `*_pct` or numeric `*_used`+`*_total`.
- [ ] `GET /user/followers` and `/user/following` return `{items:[{id,display_name,handle,role,avatar_url,is_following}]}`.
- [ ] `GET /content/browse?media_type=&genre=&vibe=` returns only matching items; each carries `media_type` + `genre` + `vibe` using the exact taxonomy strings.
- [ ] All endpoints answer the CORS `OPTIONS` preflight; all image URLs are HTTPS.

Once these pass, the app's Feed, complete Profile, and Home filter dropdowns
light up with real data — no app change needed (the app already calls these
exact paths).
