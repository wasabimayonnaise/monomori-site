# Monomori Web Companion Tool — Handoff Document

## Who I Am

I'm WasabiMayonnaise (Pico), a non-coder on EndeavourOS (hostname: minerva, username: pico). I built and maintain Monomori, an Android collection management app (Kotlin/Jetpack Compose). The app repo is at `/home/pico/StudioProjects/monomori`. I work with Claude Code (CC) in the terminal for code execution and Claude (this chat) for architecture/design/review. I never write code directly — Claude handles that. I need instructions clear, explicit, and step by step.

## What Monomori Is

An Android app for managing physical collections (figures, vinyl records, books, games, etc.). Key features:
- 46 built-in categories + user-created custom categories
- Dynamic field system via FieldMapper.kt / EnumFieldMapper.kt
- Three view modes (card, tile, list) with sort-by-column in list view
- Barcode scanning (ML Kit), metadata enrichment (Google Books, Discogs, TMDb, IGDB)
- Photo management with PhotoWithMetadata
- Backup/restore (ZIP containing backup.json + images/)
- Export feature with 4 copy-paste formats (Reddit/eBay/Forums/Plain text) + file save
- 12+ glassmorphic themes
- Privacy-first: no accounts, no cloud, no analytics

## The Project: Web Companion Tool

### What It Is
A browser-based companion tool at `monomori.app/companion/` that:
1. Lets users load their Monomori backup ZIP in the browser (client-side only, nothing uploaded anywhere)
2. Browse their collection read-only (category grid → items list → item detail, mirroring the app)
3. Add new items via a web form (typing on a keyboard is easier than on a phone)
4. Generate a QR code containing the item data
5. User scans QR with their phone camera → Monomori opens → Add Item screen pre-filled with the data

### Why It Exists
- Typing detailed item info on a phone keyboard is painful
- The QR bridge avoids building accounts/sync/server infrastructure
- Matches Monomori's privacy-first identity (everything stays local)
- Lives alongside the existing marketing site on GitHub Pages

## Architecture Decisions Already Made

### Deployment
- Lives at: `/home/pico/StudioProjects/monomori/monomori site/companion/`
- Deploys to: `monomori.app/companion/` via GitHub Pages (wasabimayonnaise/monomori-site repo)
- The marketing site is a single HTML file (monomori-site.html) — no SPA infrastructure, no routing, no service workers
- Adding `companion/index.html` to the repo makes it available at `monomori.app/companion/` automatically

### Tech Stack
- Vanilla HTML/CSS/JS with ES modules — no framework, no build step, no npm
- Self-contained, modern browsers handle ES modules natively
- Libraries: JSZip (ZIP extraction), qrcode.js or similar (QR rendering) — loaded from CDN or bundled in lib/

### Directory Structure
```
companion/
  index.html          ← shell + navigation
  css/
    style.css         ← glassmorphic theme, layout
  js/
    app.js            ← main app logic, routing, state
    backup-loader.js  ← ZIP/JSON parsing
    field-config.json ← category field definitions (extracted from Android codebase)
    qr-generator.js   ← QR code building
  lib/
    jszip.min.js      ← ZIP extraction
    qrcode.min.js     ← QR rendering
```

Directories already created at the path above.

### QR Data Format
Deep-link URL with JSON payload:
```
monomori://additem?data={"category":"VIDEO_GAMES","TITLE":"Ico","PLATFORM":"PS2"}
```
- The JSON payload is a flat Map<String, Any?> with UPPER_SNAKE_CASE keys
- This is exactly what EntityConverter.toEntity() already consumes on the Android side
- One QR per item (not batch)
- ~858 bytes practical capacity at QR V20 ECC M — a typical item with 8-12 fields is ~150-600 bytes, fits easily
- Long NOTES/DESCRIPTION fields should be truncated or omitted from the QR payload

### Phone-Side Handler (Future, Not Part of This Work)
When we eventually build the Android side:
- Add intent-filter to AndroidManifest.xml for `monomori://additem` scheme
- Handler in MonomoriNavigation.kt parses URI, extracts JSON, navigates to Add Item with pre-filled field map
- No changes to existing barcode scanner needed — user scans QR with their default camera app, which opens Monomori via the deep link
- Current scanner uses ML Kit with EAN-13 only; the deep-link approach bypasses it entirely

### Browse Experience
- Category grid home → items list → item detail (mirrors the app's navigation)
- Images from the backup ZIP displayed as blob URLs (extracted client-side)
- Glassmorphic styling matching the app's visual identity (dark theme, glass effects, same fonts/colors)

## Backup Format (What the Companion Parses)

### ZIP Structure
```
monomori_backup_YYYY-MM-DD_HHMMSS.zip
├── backup.json           ← all collection data + prefs + API keys + image index
└── images/
    ├── abc123.jpg        ← flat directory, all images regardless of category
    └── def456.jpg
```

### backup.json Schema
```json
{
  "metadata": {
    "version": "1.0",
    "appVersion": "1.0.0",
    "exportDate": "2025-06-26T14:30:22Z",
    "deviceInfo": "Google Pixel 8",
    "totalItems": 47,
    "totalImages": 12
  },
  "content": {
    "collections": { ... },
    "preferences": { ... },
    "apiKeys": { ... },
    "imageMap": { ... },
    "customCategoryMetadata": [ ... ]
  }
}
```

### Collections Map
Key = lowercased category enum name ("books", "music", "video_games", "custom", etc.)
Value = JSON array of entity objects serialized by Gson.

### Example Item (VideoGame)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "VIDEO_GAMES",
  "primaryImage": {
    "filePath": "/data/user/0/com.monomori/files/images/abc123.jpg",
    "dateTaken": 1705320600000,
    "comment": "",
    "id": "photo-uuid"
  },
  "additionalImages": [],
  "dateAdded": 1705320600000,
  "title": "Super Mario Bros.",
  "platform": "NES",
  "developer": "Nintendo",
  "condition": "VERY_GOOD",
  "boxed": true,
  "tags": ["retro", "nintendo"],
  "barcode": "045496590420",
  "customFields": { "fields": [] }
}
```

### Key Type Details
- All dates: Unix millisecond timestamps (Long)
- primaryImage: JSON object (PhotoWithMetadata), NOT a bare path string
- BookEntity.id is Long integer (auto-increment) — the ONE anomalous primary key; all others are UUID strings
- Enums stored as uppercase name strings ("COMPLETED", "VERY_GOOD")
- Images are flat under images/ in the ZIP; referenced by absolute device path in primaryImage.filePath
- coverImageUrl is a separate HTTP URL field (API-fetched covers) — NOT stored in the ZIP
- customFields wraps a list of CustomField objects; most items have "fields": []

### Custom Categories
- Items go into collections["custom"]
- customCategoryMetadata is a separate top-level array (name, icon, color, orderIndex)
- Custom items have customCategoryId UUID and categoryName field
- categoryName always stores literal "Custom" (known bug); actual display name comes from customCategoryMetadata

### Preferences in Backup
```json
{
  "selectedTheme": "monomori_default",
  "viewTypes": { "books": "GRID", "music": "LIST" },
  "fieldVisibility": { "books": { "TITLE": true, "PUBLISHER": false } },
  "visibleCategories": ["books", "music", "video_games"]
}
```

## Field Config Extraction (IN PROGRESS)

### What It Is
A JSON file (`companion/js/field-config.json`) containing field definitions for all 46 built-in categories, extracted from the Android codebase's FieldMapper.kt, EnumFieldMapper.kt, and Enums.kt.

### Current Status
**CC managed to extract ~20 of 46 categories before repeatedly hanging on the remaining batches.** The partial file exists at:
```
/home/pico/StudioProjects/monomori/monomori site/companion/js/field-config.json
```

**The extraction needs to be completed.** The three source files needed are:
- `app/src/main/java/com/monomori/util/FieldMapper.kt` — field definitions per category
- `app/src/main/java/com/monomori/util/EnumFieldMapper.kt` — which fields are enums and their enum class names
- `app/src/main/java/com/monomori/data/model/Enums.kt` — actual enum class values

### JSON Structure Per Category
```json
{
  "VIDEO_GAMES": {
    "titleKey": "TITLE",
    "fields": [
      {"key":"TITLE","label":"Title","type":"TEXT_SHORT","required":true},
      {"key":"PLATFORM","label":"Platform","type":"TEXT_SHORT","required":false},
      {"key":"CONDITION","label":"Condition","type":"ENUM","required":false,"enumClass":"ItemCondition"},
      {"key":"BOXED","label":"Boxed","type":"BOOLEAN","required":false},
      {"key":"RELEASE_DATE","label":"Release Date","type":"DATE","required":false},
      {"key":"TAGS","label":"Tags","type":"TEXT_LIST","required":false}
    ]
  }
}
```

### Field Types Used
- TEXT_SHORT — single-line string
- TEXT_LONG — multi-line string (NOTES, SYNOPSIS, DESCRIPTION)
- TEXT_LIST — array of strings (TAGS, AUTHORS, CAST)
- NUMBER_INT — integer (PAGE_COUNT, PIECE_COUNT)
- NUMBER_DECIMAL — decimal (PURCHASE_PRICE, RATING)
- BOOLEAN — true/false (BOXED, SIGNED)
- DATE — date value
- ENUM — constrained choice; has enumClass property naming the enum
- BARCODE — barcode/ISBN/UPC string
- IMAGE_URL — URL string (cover images, external links)

### Title Key Varies By Category
- Most categories: "TITLE" or "NAME"
- Music: "ALBUM_TITLE"
- Lego: "SET_NAME"
- Plants: "PLANT_NAME"
- Perfumes: "FRAGRANCE_NAME"
- Sneakers: "SNEAKER_NAME"
- Sports Cards: "CARD_NAME"
- Antiques/Bags/Coins/etc: "ITEM_NAME"
- Autographs/Concert Tickets: "ITEM_TITLE"
(Full mapping is in FieldMapper.getTitleKey())

### Known Quirks Flagged During Extraction
1. RELEASE_YEAR is TEXT_SHORT (not NUMBER_INT) due to Android type-inference quirk — override to number input in the web form
2. URL fields (GOODREADS_URL, IMDB_URL, etc.) typed as IMAGE_URL due to inference order — treat as plain URL inputs
3. COMICS.READ_STATUS is TEXT_SHORT (no enum registered for Comics' read status, unlike Books)
4. MODEL_KITS.BUILT_STATUS vs BUILD_STATUS key mismatch in EnumFieldMapper — no enum applied, stays text
5. CUSTOM_FIELDS appears in every category as TEXT_SHORT — skip rendering this in the companion (it's a complex nested structure)

### Enum Values Still Needed
After the field config is complete, we need to populate the actual enum values. Known enums:
- ItemCondition (used across most categories for CONDITION field)
- ReadStatus (BOOKS)
- ListenStatus (MUSIC)
- RarityLevel (TRADING_CARDS)
- Plus potentially others in EnumFieldMapper

The enum values come from the enum class definitions in Enums.kt.

## Implementation Phases

### Phase 1 — Load and Browse (Foundation)
- File picker to select backup ZIP
- JSZip to unzip client-side
- Parse backup.json, extract collections
- Category grid (matching app's home screen feel)
- Tap category → items list with thumbnails
- Tap item → detail view showing all fields
- Images extracted from ZIP displayed as blob URLs
- Glassmorphic styling matching Monomori's visual identity

### Phase 2 — Add Item + QR
- "Add Item" button → category picker
- Dynamic form based on category's field definitions from field-config.json
- Form renders appropriate inputs per field type (text, number, boolean toggle, enum dropdown, date picker, tags)
- Generate QR code containing monomori://additem?data=<url-encoded-json>
- Display scannable QR on screen
- Only the title field is required per category; all others optional

### Phase 3 — Polish
- Search across categories
- Responsive mobile layout
- Error handling edge cases
- Loading states

## Visual Design Direction

- Glassmorphic dark theme matching the app and marketing site
- Same color palette (teal/purple accents on dark backgrounds)
- Same fonts (the marketing site loads from Google Fonts)
- Functional layout (sidebar or tabs for navigation) rather than cinematic (the marketing site's horizontal scroll panels)
- The companion is a tool, not a marketing page — optimize for usability over visual impact

## Files to Upload in New Chat

To complete the field-config.json extraction, upload these three files:
1. `app/src/main/java/com/monomori/util/FieldMapper.kt`
2. `app/src/main/java/com/monomori/util/EnumFieldMapper.kt`
3. `app/src/main/java/com/monomori/data/model/Enums.kt`

Also upload the partial field-config.json if CC produced one:
4. `/home/pico/StudioProjects/monomori/monomori site/companion/js/field-config.json`

## Workflow Preferences

- Claude (chat) handles architecture, design, review, and generates prompts for Claude Code
- Claude Code (terminal) handles file reading, code writing, builds, and git operations
- I never write code directly — I review every phase before it's applied
- Show diffs/content in full as plain text in fenced code blocks
- Wait for approval after each phase before applying
- One command or action at a time for terminal instructions
- Don't suggest I take breaks or step away — I manage my own pacing
- For Monomori app changes: edit tool worktree restriction active, use Bash + git apply with diffs-shown-first, all merges use --no-ff, heredoc for git commit messages
- The web companion is a separate project from the app repo — it lives in the monomori-site GitHub Pages repo, not the app repo
