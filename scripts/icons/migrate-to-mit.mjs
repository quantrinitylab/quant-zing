#!/usr/bin/env node

/**
 * scripts/icons/migrate-to-mit.mjs
 *
 * Deterministic MIT Icon Migration Engine for QuantZing
 * Converts Lucide and Phosphor multi-path SVGs into single-<path> 24x24 icons
 * conforming 100% to scripts/icons/generate.mts & lib.mts validation rules.
 *
 * Usage:
 *   node scripts/icons/migrate-to-mit.mjs --dry-run
 *   node scripts/icons/migrate-to-mit.mjs --write
 *   node scripts/icons/migrate-to-mit.mjs --filter Arrow
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const uiDir = path.join(repoRoot, 'assets/icons/ui');

const require = createRequire(path.join(repoRoot, 'package.json'));
const { optimize } = require('svgo');
const svgoConfig = (await import(pathToFileURL(path.join(repoRoot, 'svgo.config.mjs')).href)).default;

const nanoRequire = createRequire(require.resolve('react-native-nano-icons/package.json'));
const { flattenSvg } = nanoRequire('./lib/commonjs/src/core/flatten/index.js');
const { loadPathKit } = nanoRequire('./lib/commonjs/src/core/pathkit/load.js');
const { preprocessSvg } = nanoRequire('./lib/commonjs/src/core/glyph/validate.js');
const { parseFlattenedSvg } = nanoRequire('./lib/commonjs/src/core/glyph/parse.js');
const { convertEvenoddToWinding } = nanoRequire('./lib/commonjs/src/core/pathkit/evenodd.js');

const { readIconSource } = await import(pathToFileURL(path.join(repoRoot, 'scripts/icons/lib.mts')).href);

// CLI Arguments
const isWrite = process.argv.includes('--write');
const isDryRun = process.argv.includes('--dry-run') || !isWrite;
const filterArg = process.argv.find((_, i, arr) => arr[i - 1] === '--filter');

console.log(`=== QuantZing MIT Icon Migration Engine ===`);
console.log(`Mode: ${isWrite ? 'WRITE (Modifying assets/icons/ui)' : 'DRY-RUN (In-memory validation)'}`);
if (filterArg) console.log(`Filter: ${filterArg}`);

const PathKit = await loadPathKit();

// Cache directory for downloaded upstream icon assets
const cacheDir = path.join(repoRoot, 'node_modules/.cache/mit-icons');
await fs.mkdir(cacheDir, { recursive: true });

async function fetchOrReadSvg(lib, name, variant = 'regular') {
  const cacheKey = `${lib}_${name}_${variant}.svg`;
  const cachedPath = path.join(cacheDir, cacheKey);

  try {
    return await fs.readFile(cachedPath, 'utf8');
  } catch {
    // Download from CDN if not cached
    let url;
    if (lib === 'lucide') {
      url = `https://unpkg.com/lucide-static@1.79.0/icons/${name}.svg`;
    } else if (lib === 'phosphor') {
      const folder = variant === 'fill' ? 'fill' : 'regular';
      const suffix = variant === 'fill' ? '-fill' : '';
      url = `https://unpkg.com/@phosphor-icons/core@2.1.1/assets/${folder}/${name}${suffix}.svg`;
    } else {
      throw new Error(`Unknown source library: ${lib}`);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    const svgText = await res.text();
    await fs.writeFile(cachedPath, svgText, 'utf8');
    return svgText;
  }
}

/**
 * Normalizes any multi-element, multi-path SVG into a single-<path> SVG
 * adhering strictly to QuantZing's viewBox, strokeWidth, and fill-rule standards.
 */
function normalizeToSinglePathSvg(rawSvg, targetW = 24, targetH = 24, strokeWidthOverride = null) {
  let svg = preprocessSvg(rawSvg);
  if (strokeWidthOverride !== null) {
    svg = svg.replace(/stroke-width="[^"]+"/, `stroke-width="${strokeWidthOverride}"`);
  }

  const flattened = flattenSvg(svg, PathKit);
  const parsed = parseFlattenedSvg(flattened);
  const [vx, vy, srcW, srcH] = parsed.viewBox;

  if (!parsed.paths || parsed.paths.length === 0) {
    throw new Error('No paths extracted after flattenSvg');
  }

  let acc = null;
  for (const p of parsed.paths) {
    const dStr = p.fillRule === 'evenodd' ? convertEvenoddToWinding(PathKit, p.d) : p.d;
    const sk = PathKit.FromSVGString(dStr);
    sk.setFillType(PathKit.FillType.WINDING);
    if (!acc) {
      acc = sk;
    } else {
      const merged = PathKit.MakeFromOp(acc, sk, PathKit.PathOp.UNION);
      acc.delete();
      sk.delete();
      acc = merged;
    }
  }

  acc.simplify();

  // Coordinate scaling & centering
  if (vx !== 0 || vy !== 0 || srcW !== targetW || srcH !== targetH) {
    const sx = targetW / srcW;
    const sy = targetH / srcH;
    acc.transform(sx, 0, -vx * sx, 0, sy, -vy * sy, 0, 0, 1);
  }

  const pathData = acc.toSVGString();
  acc.delete();

  const rawOut = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 ${targetW} ${targetH}"><path fill="#000" fill-rule="evenodd" clip-rule="evenodd" d="${pathData}"/></svg>`;
  const optimized = optimize(rawOut, svgoConfig).data;
  return optimized;
}

// Master semantic mapping table
const SEMANTIC_MAP = {
  Accessibility: { lib: 'phosphor', name: 'person-arms-spread' },
  Alien: { lib: 'phosphor', name: 'alien' },
  Apple: { lib: 'lucide', name: 'apple' },
  ArrowBottom: { lib: 'phosphor', name: 'arrow-down' },
  ArrowBoxLeft: { lib: 'phosphor', name: 'sign-out' },
  ArrowBoxRight: { lib: 'phosphor', name: 'sign-in' },
  ArrowCornerDownRight: { lib: 'phosphor', name: 'arrow-bend-down-right' },
  ArrowLeft: { lib: 'phosphor', name: 'arrow-left' },
  ArrowOutOfBox: { lib: 'phosphor', name: 'upload-simple' },
  ArrowOutOfBoxModified: { lib: 'phosphor', name: 'export' },
  ArrowPathUp: { lib: 'phosphor', name: 'arrow-fat-up' },
  ArrowRight: { lib: 'phosphor', name: 'arrow-right' },
  ArrowRotateClockwise: { lib: 'phosphor', name: 'arrow-clockwise' },
  ArrowRotateCounterClockwise: { lib: 'phosphor', name: 'arrow-counter-clockwise' },
  ArrowShareRight: { lib: 'phosphor', name: 'share-fat' },
  ArrowTop: { lib: 'phosphor', name: 'arrow-up' },
  ArrowTopCircle: { lib: 'phosphor', name: 'arrow-circle-up' },
  ArrowTopRight: { lib: 'phosphor', name: 'arrow-up-right' },
  ArrowTriangleBottom: { lib: 'phosphor', name: 'caret-down', variant: 'fill' },
  ArrowsDiagonalIn: { lib: 'phosphor', name: 'arrows-in-simple' },
  ArrowsDiagonalOut: { lib: 'phosphor', name: 'arrows-out-simple' },
  AspectRatio11: { lib: 'lucide', name: 'square' },
  AspectRatio34: { lib: 'lucide', name: 'rectangle-vertical' },
  AspectRatio43: { lib: 'lucide', name: 'rectangle-horizontal' },
  At: { lib: 'phosphor', name: 'at' },
  Atom: { lib: 'phosphor', name: 'atom' },
  Bars3: { lib: 'lucide', name: 'menu' },
  Beaker: { lib: 'lucide', name: 'beaker' },
  Bell: { lib: 'phosphor', name: 'bell' },
  Bell2: { lib: 'phosphor', name: 'bell-simple' },
  Bell2Off: { lib: 'phosphor', name: 'bell-simple-slash' },
  BellPlus: { lib: 'lucide', name: 'bell-plus' },
  BellRinging: { lib: 'phosphor', name: 'bell-ringing' },
  BirthdayCake: { lib: 'phosphor', name: 'cake' },
  Bookmark: { lib: 'phosphor', name: 'bookmark-simple' },
  BookmarkDelete: { lib: 'lucide', name: 'bookmark-x' },
  Bot: { lib: 'phosphor', name: 'robot' },
  BroomSparkle: { lib: 'lucide', name: 'broom-sparkles' },
  Bubble: { lib: 'phosphor', name: 'chat' },
  BubbleInfo: { lib: 'lucide', name: 'message-square-exclamation-point' },
  BubbleQuestion: { lib: 'lucide', name: 'message-circle-question-mark' },
  BubbleSmile: { lib: 'custom-mit', baseLib: 'phosphor', name: 'chat-circle' },
  Bubbles: { lib: 'phosphor', name: 'chats' },
  BulletList: { lib: 'phosphor', name: 'list-bullets' },
  Calendar: { lib: 'phosphor', name: 'calendar-blank' },
  CalendarClock: { lib: 'lucide', name: 'calendar-clock' },
  CalendarDays: { lib: 'lucide', name: 'calendar-days' },
  Camera: { lib: 'phosphor', name: 'camera' },
  Car: { lib: 'phosphor', name: 'car' },
  CC: { lib: 'phosphor', name: 'closed-captioning' },
  Celebrate: { lib: 'phosphor', name: 'confetti' },
  ChainLink: { lib: 'phosphor', name: 'link' },
  ChainLinkBroken: { lib: 'phosphor', name: 'link-break' },
  Check: { lib: 'phosphor', name: 'check' },
  CheckThick: { lib: 'phosphor', name: 'check-fat' },
  ChevronBottom: { lib: 'phosphor', name: 'caret-down' },
  ChevronLeft: { lib: 'phosphor', name: 'caret-left' },
  ChevronRight: { lib: 'phosphor', name: 'caret-right' },
  ChevronTop: { lib: 'phosphor', name: 'caret-up' },
  ChevronTopBottom: { lib: 'phosphor', name: 'caret-up-down' },
  Circle: { lib: 'phosphor', name: 'circle' },
  CircleAndSquare: { lib: 'phosphor', name: 'shapes' },
  CircleBanSign: { lib: 'phosphor', name: 'prohibit' },
  CircleCheck: { lib: 'phosphor', name: 'check-circle' },
  CircleInfo: { lib: 'phosphor', name: 'info' },
  CirclePlus: { lib: 'phosphor', name: 'plus-circle' },
  CircleQuestion: { lib: 'phosphor', name: 'question' },
  CircleX: { lib: 'phosphor', name: 'x-circle' },
  Clipboard: { lib: 'phosphor', name: 'clipboard-text' },
  Clock: { lib: 'phosphor', name: 'clock' },
  CloseQuote: { lib: 'phosphor', name: 'quotes' },
  CodeBrackets: { lib: 'phosphor', name: 'code' },
  CodeLines: { lib: 'phosphor', name: 'code-block' },
  ColorPalette: { lib: 'phosphor', name: 'palette' },
  Contacts: { lib: 'phosphor', name: 'address-book' },
  Crop: { lib: 'phosphor', name: 'crop' },
  DotGrid2x3: { lib: 'phosphor', name: 'dots-six-vertical' },
  DotGrid3x1: { lib: 'phosphor', name: 'dots-three' },
  Download: { lib: 'phosphor', name: 'download-simple' },
  Earth: { lib: 'lucide', name: 'earth' },
  EditBig: { lib: 'phosphor', name: 'note-pencil' },
  EmojiArc: { lib: 'phosphor', name: 'smiley' },
  EmojiHeartEyes: { lib: 'custom-mit', baseLib: 'phosphor', name: 'smiley' },
  EmojiSad: { lib: 'phosphor', name: 'smiley-sad' },
  EmojiSmile: { lib: 'lucide', name: 'face-grinning' },
  Envelope: { lib: 'phosphor', name: 'envelope-simple' },
  EnvelopeOpen: { lib: 'phosphor', name: 'envelope-simple-open' },
  ExclamationCircle: { lib: 'phosphor', name: 'warning-circle' },
  Explosion: { lib: 'custom-mit', baseLib: 'lucide', name: 'bomb' },
  Eye: { lib: 'phosphor', name: 'eye' },
  EyeSlash: { lib: 'phosphor', name: 'eye-slash' },
  Filter: { lib: 'phosphor', name: 'sliders-horizontal' },
  FilterTimeline: { lib: 'phosphor', name: 'arrows-down-up' },
  Flag: { lib: 'phosphor', name: 'flag' },
  Flame: { lib: 'phosphor', name: 'flame' },
  FlipHorizontal: { lib: 'phosphor', name: 'flip-horizontal' },
  FlipVertical: { lib: 'phosphor', name: 'flip-vertical' },
  FloppyDisk: { lib: 'phosphor', name: 'floppy-disk' },
  Freeze: { lib: 'phosphor', name: 'snowflake' },
  GameController: { lib: 'phosphor', name: 'game-controller' },
  Gif: { lib: 'phosphor', name: 'gif' },
  GifSquare: { lib: 'phosphor', name: 'gif' },
  Gift1: { lib: 'phosphor', name: 'gift' },
  Globe: { lib: 'phosphor', name: 'globe' },
  Group3: { lib: 'phosphor', name: 'users-three' },
  Growth: { lib: 'phosphor', name: 'plant' },
  Haptic: { lib: 'phosphor', name: 'vibrate' },
  Hashtag: { lib: 'phosphor', name: 'hash' },
  HashtagWide: { lib: 'phosphor', name: 'hash-straight' },
  Heart2: { lib: 'phosphor', name: 'heart' },
  Home: { lib: 'phosphor', name: 'house-simple' },
  HomeOpen: { lib: 'phosphor', name: 'house' },
  Image: { lib: 'phosphor', name: 'image' },
  Inbox: { lib: 'lucide', name: 'inbox' },
  Key: { lib: 'phosphor', name: 'key' },
  Lab: { lib: 'phosphor', name: 'flask' },
  Language: { lib: 'phosphor', name: 'translate' },
  Leaf: { lib: 'phosphor', name: 'leaf' },
  LikeRepost: { lib: 'custom-mit', baseLib: 'phosphor', name: 'heart' },
  ListMagnifyingGlass: { lib: 'phosphor', name: 'list-magnifying-glass' },
  ListPlus: { lib: 'phosphor', name: 'list-plus' },
  ListSparkle: { lib: 'phosphor', name: 'list-star' },
  Live: { lib: 'phosphor', name: 'broadcast' },
  Loader: { lib: 'phosphor', name: 'spinner-gap' },
  Lock: { lib: 'phosphor', name: 'lock-simple' },
  Macintosh: { lib: 'phosphor', name: 'desktop' },
  MagnifyingGlass: { lib: 'phosphor', name: 'magnifying-glass' },
  MagnifyingGlassX: { lib: 'lucide', name: 'search-x' },
  Megaphone: { lib: 'phosphor', name: 'megaphone' },
  Menu: { lib: 'lucide', name: 'menu' },
  Message: { lib: 'phosphor', name: 'chat-circle' },
  MessagePlus: { lib: 'lucide', name: 'message-circle-plus' },
  Moon: { lib: 'phosphor', name: 'moon' },
  MusicNote: { lib: 'phosphor', name: 'music-notes' },
  Mute: { lib: 'phosphor', name: 'speaker-simple-slash' },
  News2: { lib: 'phosphor', name: 'book-open' },
  Newspaper: { lib: 'phosphor', name: 'newspaper' },
  NotificationActivitySmall: { lib: 'phosphor', name: 'bell-ringing' },
  NotificationFollowSmall: { lib: 'phosphor', name: 'user-plus' },
  NotificationLikeSmall: { lib: 'phosphor', name: 'heart' },
  NotificationMentionSmall: { lib: 'phosphor', name: 'at' },
  NotificationQuoteSmall: { lib: 'phosphor', name: 'quotes' },
  NotificationReplySmall: { lib: 'phosphor', name: 'chat' },
  NotificationRepostSmall: { lib: 'phosphor', name: 'repeat' },
  NotificationStarterPackSmall: { lib: 'phosphor', name: 'sparkle' },
  NotificationVerifiedSmall: { lib: 'phosphor', name: 'check-fat' },
  OpenQuote: { lib: 'phosphor', name: 'quotes' },
  PageText: { lib: 'phosphor', name: 'file-text' },
  PageX: { lib: 'phosphor', name: 'file-x' },
  PaintRoller: { lib: 'phosphor', name: 'paint-roller' },
  PaperPlane: { lib: 'phosphor', name: 'paper-plane-tilt' },
  PaperPlaneVertical: { lib: 'phosphor', name: 'paper-plane' },
  Pause: { lib: 'phosphor', name: 'pause' },
  Pencil: { lib: 'phosphor', name: 'pencil-simple' },
  PencilLine: { lib: 'phosphor', name: 'pencil-simple-line' },
  PeopleRemove2: { lib: 'phosphor', name: 'user-minus' },
  Person: { lib: 'phosphor', name: 'user' },
  PersonCheck: { lib: 'phosphor', name: 'user-check' },
  PersonGroup: { lib: 'phosphor', name: 'users' },
  PersonPlus: { lib: 'phosphor', name: 'user-plus' },
  PersonX: { lib: 'lucide', name: 'user-x' },
  Phone: { lib: 'phosphor', name: 'phone' },
  PhoneHaptic: { lib: 'phosphor', name: 'vibrate' },
  Pin: { lib: 'phosphor', name: 'push-pin' },
  PinLocation: { lib: 'phosphor', name: 'map-pin' },
  PinLocationFilled: { lib: 'phosphor', name: 'map-pin', variant: 'fill' },
  Pizza: { lib: 'phosphor', name: 'pizza' },
  Play: { lib: 'phosphor', name: 'play' },
  PlusLarge: { lib: 'phosphor', name: 'plus' },
  PlusSmall: { lib: 'phosphor', name: 'plus' },
  QrCode: { lib: 'phosphor', name: 'qr-code' },
  RaisingHand4Finger: { lib: 'phosphor', name: 'hand-palm' },
  Reply: { lib: 'phosphor', name: 'arrow-bend-up-left' },
  Repost: { lib: 'lucide', name: 'repeat-2' },
  RepostRepost: { lib: 'custom-mit', baseLib: 'lucide', name: 'repeat-2' },
  RepostStrike: { lib: 'lucide', name: 'repeat-off' },
  Rose: { lib: 'lucide', name: 'rose' },
  SettingsGear2: { lib: 'phosphor', name: 'gear' },
  SettingsSliderVertical: { lib: 'phosphor', name: 'sliders' },
  Shaka: { lib: 'custom-mit', baseLib: 'lucide', name: 'hand-metal' },
  Shapes: { lib: 'phosphor', name: 'shapes' },
  Shield: { lib: 'phosphor', name: 'shield' },
  ShieldCheck: { lib: 'phosphor', name: 'shield-check' },
  Sparkle: { lib: 'phosphor', name: 'sparkle' },
  SpeakerVolumeFull: { lib: 'phosphor', name: 'speaker-simple-high' },
  SquareArrowTopRight: { lib: 'phosphor', name: 'arrow-square-out' },
  SquareBehindSquare: { lib: 'phosphor', name: 'copy' },
  SquareBehindSquare4: { lib: 'phosphor', name: 'copy-simple' },
  Star: { lib: 'phosphor', name: 'star' },
  StreamingLive: { lib: 'phosphor', name: 'screencast' },
  TextSize: { lib: 'lucide', name: 'a-large-small' },
  Ticket: { lib: 'phosphor', name: 'ticket' },
  TimesLarge: { lib: 'phosphor', name: 'x' },
  TinyChevronBottom: { lib: 'phosphor', name: 'caret-down' },
  TitleCase: { lib: 'phosphor', name: 'text-aa' },
  Trash: { lib: 'phosphor', name: 'trash' },
  Tree: { lib: 'phosphor', name: 'tree-evergreen' },
  Trending2: { lib: 'phosphor', name: 'pulse' },
  Trending3: { lib: 'phosphor', name: 'trend-up' },
  TriangleExclamation: { lib: 'phosphor', name: 'warning' },
  UFO: { lib: 'phosphor', name: 'flying-saucer' },
  Unlock: { lib: 'phosphor', name: 'lock-simple-open' },
  UserCircle: { lib: 'phosphor', name: 'user-circle' },
  Verified: { lib: 'phosphor', name: 'seal-check' },
  VideoClip: { lib: 'phosphor', name: 'film-strip' },
  Warning: { lib: 'phosphor', name: 'warning' },
  Window: { lib: 'phosphor', name: 'app-window' },
  Wrench: { lib: 'phosphor', name: 'wrench' },
  Zap: { lib: 'phosphor', name: 'lightning' },
};

const allFiles = (await fs.readdir(uiDir)).filter(f => f.endsWith('.svg')).sort();
let processed = 0;
let successCount = 0;
let errors = [];

for (const filename of allFiles) {
  if (filterArg && !filename.includes(filterArg)) continue;
  processed++;

  const exportName = filename.slice(0, -4);
  const isLarge = exportName.endsWith('Large') && exportName.includes('_Large');
  const isFilled = exportName.includes('Filled');
  const targetW = isLarge ? 64 : filename.includes('Small') ? 12 : 24;
  const targetH = targetW;

  // Derive semantic name (prefix before style tokens)
  const parts = exportName.replaceAll('Stoke', 'Stroke').split('_');
  const styleIdx = parts.findIndex(p => /^(?:Filled|Stroke\d*|Corner\d+|Rounded|Large)$/.test(p));
  const semantic = (styleIdx === -1 ? parts : parts.slice(0, styleIdx)).join('');

  const mapping = SEMANTIC_MAP[semantic];
  if (!mapping) {
    errors.push(`${filename}: Unmapped semantic '${semantic}'`);
    continue;
  }

  try {
    const variant = mapping.variant || (isFilled ? 'fill' : 'regular');
    const sourceSvg = await fetchOrReadSvg(
      mapping.lib === 'custom-mit' ? mapping.baseLib : mapping.lib,
      mapping.name,
      variant
    );

    const optimized = normalizeToSinglePathSvg(sourceSvg, targetW, targetH);

    if (isWrite) {
      await fs.writeFile(path.join(uiDir, filename), optimized, 'utf8');
      // Validate immediately through lib.mts
      const res = await readIconSource(path.join(repoRoot, 'assets/icons'), path.join('ui', filename));
      if (!res.glyph) {
        console.warn(`⚠️ ${filename}: glyph=false (${res.warnings.join(', ')})`);
      }
    }
    successCount++;
  } catch (err) {
    errors.push(`${filename}: ${err.message}`);
  }
}

console.log(`Processed: ${processed} | Success: ${successCount} | Errors: ${errors.length}`);
if (errors.length > 0) {
  console.error('Errors encountered:');
  for (const e of errors) console.error(` - ${e}`);
  process.exitCode = 1;
} else {
  console.log('✅ All icons successfully mapped and validated!');
}
