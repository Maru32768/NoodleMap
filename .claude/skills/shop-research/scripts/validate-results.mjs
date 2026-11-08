import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LINK_TYPES = ['official', 'tabelog', 'twitter', 'instagram', 'facebook', 'reservation', 'other'];
export const CHECK_FIELDS = [
  'name',
  'name_kana',
  'opened_at',
  'closed_at',
  'temporary_closure',
  'business_hours',
  'tag',
  ...LINK_TYPES.map((type) => `link.${type}`),
];

const OUTCOMES = new Set(['found', 'no_evidence', 'error']);
const NOTICE_KINDS = new Set([
  'address_differs',
  'possibly_relocated',
  'possibly_closed',
  'closed_without_date',
  'multiple_candidates',
  'suspected_injection',
]);
const IDENTITY_NOTICES = new Set(['address_differs', 'possibly_relocated', 'multiple_candidates']);
// Tabelog's terms forbid copying its information, so it identifies the shop and backs only the link to its own page.
const OFFICIAL_SOURCES = ['official_site', 'official_sns'];
const SHOP_PAGE_SOURCES = [...OFFICIAL_SOURCES, 'facility_site'];
const EVIDENCE_SOURCES = {
  name: [...SHOP_PAGE_SOURCES, 'reservation_site'],
  name_kana: [...SHOP_PAGE_SOURCES, 'reservation_site'],
  opened_at: SHOP_PAGE_SOURCES,
  closed_at: OFFICIAL_SOURCES,
  temporary_closure: OFFICIAL_SOURCES,
  business_hours: [...SHOP_PAGE_SOURCES, 'reservation_site'],
  tag: [...SHOP_PAGE_SOURCES, 'reservation_site'],
  'link.official': SHOP_PAGE_SOURCES,
  'link.tabelog': ['tabelog'],
  'link.twitter': OFFICIAL_SOURCES,
  'link.instagram': OFFICIAL_SOURCES,
  'link.facebook': OFFICIAL_SOURCES,
  'link.reservation': [...OFFICIAL_SOURCES, 'reservation_site'],
  'link.other': OFFICIAL_SOURCES,
};
// Wrong 営業時間 send someone to a shut door, so every one is read by a person.
const INDIVIDUAL_REVIEW_FIELDS = new Set(['name', 'closed_at', 'temporary_closure', 'business_hours']);
// A shop holds one value of these, so a second proposal would silently replace the first when applied.
const SINGLE_VALUE_FIELDS = new Set(['name', 'name_kana', 'opened_at', 'closed_at', 'temporary_closure', 'business_hours']);
// Mirrors server/src/main/kotlin/dev/marulabs/noodlemap/shops/BusinessHours.kt, which has the last word.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const BUSINESS_DAYS = [...WEEKDAYS, 'holiday'];
const PERIODS_MAX = 4;
const HOURS_NOTE_MAX = 200;
const DAY_MINUTES = 24 * 60;
const INDIVIDUAL_REVIEW_LINKS = new Set(['official', 'reservation', 'other']);
const SNS_DOMAINS = [
  'x.com',
  'twitter.com',
  'instagram.com',
  'facebook.com',
  'threads.net',
  'threads.com',
  'tiktok.com',
  'youtube.com',
  'line.me',
  'lin.ee',
];
// Gourmet and map sites describe a shop without speaking for it, and may copy Tabelog, so they are no one's evidence.
const GOURMET_AND_MAP_DOMAINS = [
  'tabelog.com',
  'hotpepper.jp',
  'retty.me',
  'gnavi.co.jp',
  'supleks.jp',
  'google.com',
  'google.co.jp',
  'goo.gl',
  'openstreetmap.org',
];
const NOT_OFFICIAL_DOMAINS = [...SNS_DOMAINS, ...GOURMET_AND_MAP_DOMAINS, 'tablecheck.com', 'bit.ly', 't.co'];
const X_RESERVED = new Set(['home', 'i', 'intent', 'search', 'share', 'hashtag', 'explore', 'login', 'settings']);
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv']);
const FACEBOOK_RESERVED = new Set([
  'share',
  'sharer',
  'login',
  'groups',
  'events',
  'watch',
  'photo',
  'photos',
  'posts',
  'reel',
  'reels',
  'stories',
  'marketplace',
  'gaming',
  'hashtag',
  'search',
  'help',
]);
const TABELOG_NON_FACT_PAGE = /\/(dtlrvw|dtlrvwlst|dtlphotolst|rvwr)(\/|$)/;

const MAX_RESULT_BYTES = 64 * 1024;
const MAX_LINKS = 10;
const MAX_EVIDENCE = 5;
const MAX_TAG_PROPOSALS = 6;
const MAX_TAG_CANDIDATES = 5;
const MAX_NOTICES = 5;
const NAME_MAX = 100;
const KANA_MAX = 100;
const LABEL_MAX = 100;
const URL_MAX = 2048;
const EVIDENCE_NOTE_MAX = 120;
const NOTICE_NOTE_MAX = 200;
const CANDIDATE_MAX = 30;

class Rejection extends Error {}
const reject = (reason) => {
  throw new Rejection(reason);
};

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function requireKeys(value, required, optional = []) {
  if (!isPlainObject(value)) reject('not_an_object');
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) reject('unknown_key');
  for (const key of required) if (!Object.hasOwn(value, key)) reject('missing_key');
}

function parseText(raw, max) {
  if (typeof raw !== 'string') reject('not_a_string');
  const text = raw.normalize('NFC').trim();
  if (!text) reject('empty_text');
  if (text.length > max) reject('text_too_long');
  // Cf holds the bidi overrides and zero-width characters that make a value read differently than it compares.
  if (/[\p{Cc}\p{Cf}]/u.test(text)) reject('forbidden_character');
  return text;
}

function parseProse(raw, max) {
  const text = parseText(raw, max);
  if (/https?:|www\./i.test(text)) reject('url_in_text');
  return text;
}

function parseDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) reject('invalid_date');
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) reject('invalid_date');
  return raw;
}

function parseKana(raw) {
  const kana = parseText(raw, KANA_MAX)
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  if (!/^[ぁ-ゖー ]+$/.test(kana)) reject('reading_not_hiragana');
  return kana;
}

const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const onAnyDomain = (host, domains) => domains.some((domain) => onDomain(host, domain));

function parseUrl(raw) {
  if (typeof raw !== 'string' || raw.length > URL_MAX) reject('invalid_url');
  if (/[\p{Cc}\p{Cf}\s]/u.test(raw)) reject('invalid_url');
  let url;
  try {
    url = new URL(raw);
  } catch {
    reject('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') reject('invalid_url');
  if (url.username || url.password || url.port) reject('invalid_url');
  const host = url.hostname;
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) reject('invalid_url');
  url.hash = '';
  // Percent-encoding lengthens a Japanese path, and the server's limit applies to what is stored.
  if (url.href.length > URL_MAX) reject('invalid_url');
  return url;
}

function withoutTracking(url) {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function canonicalTabelog(url) {
  if (!['tabelog.com', 's.tabelog.com', 'ssl.tabelog.com'].includes(url.hostname)) reject('link_domain_mismatch');
  const match = /^(?:\/[a-z]{2}(?:-[A-Za-z]{2})?)?\/([a-z]+)\/(A\d{4})\/(A\d{6})\/(\d+)\/?$/.exec(url.pathname);
  if (!match) reject('tabelog_not_a_shop_page');
  return `https://tabelog.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}/`;
}

function canonicalX(url) {
  if (!onAnyDomain(url.hostname, ['x.com', 'twitter.com'])) reject('link_domain_mismatch');
  const match = /^\/@?([A-Za-z0-9_]{1,15})\/?$/.exec(url.pathname);
  if (!match || X_RESERVED.has(match[1].toLowerCase())) reject('sns_not_an_account');
  return `https://x.com/${match[1]}`;
}

function canonicalInstagram(url) {
  if (!onDomain(url.hostname, 'instagram.com')) reject('link_domain_mismatch');
  const match = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(url.pathname);
  if (!match || INSTAGRAM_RESERVED.has(match[1].toLowerCase())) reject('sns_not_an_account');
  return `https://www.instagram.com/${match[1]}/`;
}

function canonicalFacebook(url) {
  if (!onDomain(url.hostname, 'facebook.com')) reject('link_domain_mismatch');
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/profile.php') {
    const id = url.searchParams.get('id') ?? '';
    if (!/^\d+$/.test(id)) reject('sns_not_an_account');
    return `https://www.facebook.com/profile.php?id=${id}`;
  }
  const namedPage = /^\/(?:people\/[^/]+\/\d+|pages\/[^/]+\/\d+|p\/[^/]+)$/.test(path);
  const vanity = /^\/([A-Za-z0-9.-]+)$/.exec(path)?.[1].toLowerCase();
  if (!namedPage && (!vanity || FACEBOOK_RESERVED.has(vanity) || vanity.endsWith('.php'))) reject('sns_not_an_account');
  return `https://www.facebook.com${path}`;
}

function canonicalReservation(url) {
  if (onDomain(url.hostname, 'tablecheck.com')) {
    url.pathname = url.pathname.replace(/^\/[a-z]{2}(?:-[A-Za-z]{2,4})?(?=\/)/, '/ja');
  }
  return withoutTracking(url);
}

function canonicalOfficial(url) {
  if (onAnyDomain(url.hostname, NOT_OFFICIAL_DOMAINS)) reject('official_on_third_party_domain');
  return withoutTracking(url);
}

const LINK_CANONICALIZERS = {
  official: canonicalOfficial,
  tabelog: canonicalTabelog,
  twitter: canonicalX,
  instagram: canonicalInstagram,
  facebook: canonicalFacebook,
  reservation: canonicalReservation,
  other: withoutTracking,
};

function parseLink(raw) {
  requireKeys(raw, ['type', 'url'], ['label']);
  if (!LINK_TYPES.includes(raw.type)) reject('unknown_link_type');
  const label = raw.label === undefined || raw.label === null ? null : parseProse(raw.label, LABEL_MAX);
  return { type: raw.type, url: LINK_CANONICALIZERS[raw.type](parseUrl(raw.url)), label };
}

function parseEvidenceItem(raw, allowedSources, today) {
  requireKeys(raw, ['url', 'sourceKind', 'observedAt', 'note']);
  if (!allowedSources.includes(raw.sourceKind)) reject('source_not_allowed_for_field');
  const url = parseUrl(raw.url);
  const onTabelog = onDomain(url.hostname, 'tabelog.com');
  if (onTabelog !== (raw.sourceKind === 'tabelog')) reject('source_domain_mismatch');
  if (onTabelog && TABELOG_NON_FACT_PAGE.test(url.pathname)) reject('tabelog_review_or_photo_page');
  if (!onTabelog && onAnyDomain(url.hostname, GOURMET_AND_MAP_DOMAINS)) reject('source_site_not_allowed');
  if (raw.sourceKind === 'official_sns' && !onAnyDomain(url.hostname, SNS_DOMAINS)) reject('source_domain_mismatch');
  const ownPage = raw.sourceKind === 'official_site' || raw.sourceKind === 'facility_site';
  if (ownPage && onAnyDomain(url.hostname, NOT_OFFICIAL_DOMAINS)) reject('source_domain_mismatch');
  const observedAt = parseDate(raw.observedAt);
  if (observedAt > today) reject('observed_in_the_future');
  return { url: url.href, sourceKind: raw.sourceKind, observedAt, note: parseProse(raw.note, EVIDENCE_NOTE_MAX) };
}

function parseEvidence(raw, checkField, estimated, today) {
  if (!Array.isArray(raw) || raw.length > MAX_EVIDENCE) reject('invalid_evidence');
  if (raw.length === 0 && !estimated) reject('evidence_required');
  return raw.map((item) => parseEvidenceItem(item, EVIDENCE_SOURCES[checkField], today));
}

function parseClosure(raw, today) {
  requireKeys(raw, ['startsOn', 'reopensOn']);
  const startsOn = parseDate(raw.startsOn);
  const reopensOn = raw.reopensOn === null ? null : parseDate(raw.reopensOn);
  if (reopensOn !== null && reopensOn <= startsOn) reject('reopens_before_start');
  if (reopensOn !== null && reopensOn < today) reject('closure_already_ended');
  return { startsOn, reopensOn };
}

function parseMinutes(raw) {
  const match = typeof raw === 'string' ? /^([0-9]{2}):([0-5][0-9])$/.exec(raw) : null;
  if (!match) reject('invalid_business_time');
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseBusinessDay(raw) {
  requireKeys(raw, ['day', 'periods'], ['closedWeeks']);
  if (!BUSINESS_DAYS.includes(raw.day)) reject('unknown_business_day');
  if (!Array.isArray(raw.periods) || raw.periods.length > PERIODS_MAX) reject('invalid_business_periods');
  let previousClose = 0;
  const periods = raw.periods.map((period) => {
    requireKeys(period, ['opensAt', 'closesAt']);
    const opens = parseMinutes(period.opensAt);
    const closes = parseMinutes(period.closesAt);
    if (opens >= DAY_MINUTES || closes <= opens || closes > opens + DAY_MINUTES) reject('business_period_out_of_range');
    if (opens < previousClose) reject('business_periods_overlap');
    previousClose = closes;
    return { opensAt: period.opensAt, closesAt: period.closesAt };
  });
  const weeks = raw.closedWeeks ?? [];
  if (!Array.isArray(weeks) || weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 5) || new Set(weeks).size !== weeks.length) {
    reject('invalid_closed_weeks');
  }
  if (weeks.length === 0) return { day: raw.day, periods };
  if (raw.day === 'holiday' || periods.length === 0) reject('closed_weeks_without_hours');
  return { day: raw.day, periods, closedWeeks: weeks.toSorted((a, b) => a - b) };
}

/** The 確認日 is left out here: it comes from the evidence, not from what the researcher writes. */
function parseBusinessHours(raw) {
  requireKeys(raw, ['kind', 'days', 'note']);
  if (raw.kind !== 'weekly' && raw.kind !== 'irregular') reject('unknown_business_hours_kind');
  if (!Array.isArray(raw.days)) reject('invalid_business_days');
  const note = raw.note === null ? null : parseProse(raw.note, HOURS_NOTE_MAX);
  if (raw.kind === 'irregular') {
    if (raw.days.length > 0) reject('irregular_with_schedule');
    return { kind: 'irregular', days: [], note };
  }
  const days = raw.days.map(parseBusinessDay);
  const byDay = new Map(days.map((day) => [day.day, day]));
  if (byDay.size !== days.length) reject('duplicate_business_day');
  if (WEEKDAYS.some((day) => !byDay.has(day))) reject('missing_weekday');
  return { kind: 'weekly', days: BUSINESS_DAYS.filter((day) => byDay.has(day)).map((day) => byDay.get(day)), note };
}

// The schedule without its 確認日, in the API's shape where an absent note is null.
const scheduleOf = (hours) => hours && JSON.stringify([hours.kind, hours.days, hours.note ?? null]);

// Shop dates are Japanese calendar dates, and a UTC date would call this morning's observation "future".
export const todayInJapan = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dateOf = (timestamp) => timestamp?.slice(0, 10) ?? null;

function parseValue(field, raw, shop, tagsBySlug, today) {
  switch (field) {
    case 'name':
      return parseProse(raw, NAME_MAX);
    case 'name_kana':
      return parseKana(raw);
    case 'opened_at': {
      const date = parseDate(raw);
      if (shop.closedAt && date > dateOf(shop.closedAt)) reject('opened_after_closed');
      return date;
    }
    case 'closed_at': {
      const date = parseDate(raw);
      if (shop.openedAt && date < dateOf(shop.openedAt)) reject('closed_before_opened');
      return date;
    }
    case 'temporary_closure':
      if (shop.closedAt) reject('closure_on_closed_shop');
      return parseClosure(raw, today);
    case 'business_hours':
      if (shop.closedAt) reject('hours_on_closed_shop');
      return parseBusinessHours(raw);
    case 'link':
      return parseLink(raw);
    case 'tag': {
      const tag = typeof raw === 'string' ? tagsBySlug.get(raw) : undefined;
      if (!tag) reject('unknown_tag');
      if (tag.category !== null && tag.category !== shop.category) reject('tag_category_mismatch');
      return raw;
    }
    default:
      return reject('unknown_field');
  }
}

function isNoop(field, value, shop) {
  switch (field) {
    case 'name':
      return value === shop.name;
    case 'name_kana':
      return value === shop.nameKana;
    case 'opened_at':
      return value === dateOf(shop.openedAt);
    case 'closed_at':
      return value === dateOf(shop.closedAt);
    case 'temporary_closure':
      return (
        value.startsOn === shop.temporaryClosure?.startsOn && value.reopensOn === shop.temporaryClosure?.reopensOn
      );
    // The same schedule seen again still moves the 確認日 forward, so only a newer 確認日 already stored is nothing new.
    case 'business_hours':
      return (
        scheduleOf(value) === scheduleOf(shop.businessHours) && (shop.businessHours?.checkedOn ?? '') >= value.checkedOn
      );
    case 'link':
      return shop.links.some((link) => link.type === value.type && link.url === value.url);
    case 'tag':
      return shop.tags.includes(value);
    default:
      return false;
  }
}

// Links and tags are additions, so approving one must not invalidate the next: they carry no base value to conflict on.
function baseValueOf(field, shop) {
  switch (field) {
    case 'name':
      return shop.name;
    case 'name_kana':
      return shop.nameKana;
    case 'opened_at':
      return shop.openedAt;
    case 'closed_at':
      return shop.closedAt;
    case 'temporary_closure':
      return shop.temporaryClosure;
    case 'business_hours':
      return shop.businessHours ?? null;
    default:
      return null;
  }
}

function hasCurrentValue(checkField, shop) {
  if (checkField.startsWith('link.')) {
    const type = checkField.slice('link.'.length);
    return shop.links.some((link) => link.type === type);
  }
  if (checkField === 'tag') return shop.tags.length > 0;
  return baseValueOf(checkField, shop) !== null;
}

const checkFieldOf = (field, value) => (field === 'link' ? `link.${value.type}` : field);

function rawCheckField(raw) {
  if (raw?.field !== 'link') return raw?.field;
  return LINK_TYPES.includes(raw?.value?.type) ? `link.${raw.value.type}` : null;
}

const dedupeKey = (shopId, field, value) =>
  createHash('sha256')
    .update(JSON.stringify([shopId, field, value]))
    .digest('hex');

const tabelogShopId = (href) => /\/A\d{4}\/A\d{6}\/(\d+)(?:\/|$)/.exec(new URL(href).pathname)?.[1] ?? null;

const citesItsOwnPage = (field, value, evidence) =>
  field === 'link' &&
  value.type === 'tabelog' &&
  evidence.some((item) => tabelogShopId(item.url) === tabelogShopId(value.url));

function reviewReasonsOf(field, value, estimated, evidence, notices, shop) {
  const reasons = [];
  if (INDIVIDUAL_REVIEW_FIELDS.has(field)) reasons.push('high_impact_field');
  // Filling a gap can be approved in bulk. Replacing a value someone entered needs a person to compare the two.
  else if (baseValueOf(field, shop) !== null) reasons.push('replaces_existing_value');
  if (field === 'link' && INDIVIDUAL_REVIEW_LINKS.has(value.type)) reasons.push('link_needs_review');
  if (estimated) reasons.push('estimated_reading');
  if (notices.some((notice) => notice.kind === 'suspected_injection')) reasons.push('suspected_injection');
  if (notices.some((notice) => IDENTITY_NOTICES.has(notice.kind))) reasons.push('identity_uncertain');
  // The validator cannot tell a real official page from a page claiming to be one. All it can confirm is
  // a Tabelog link citing that same page, so anything else that would pass in bulk goes to a person.
  if (reasons.length === 0 && !citesItsOwnPage(field, value, evidence)) reasons.push('source_unconfirmed');
  return reasons;
}

function parseNotices(raw, shopId, rejected) {
  if (!Array.isArray(raw) || raw.length > MAX_NOTICES) {
    rejected.push({ shopId, where: 'notices', reason: 'invalid_notices' });
    return [{ kind: 'suspected_injection', note: 'notices were unreadable', url: null }];
  }
  const notices = [];
  raw.forEach((item, i) => {
    try {
      requireKeys(item, ['kind', 'note'], ['url']);
      if (!NOTICE_KINDS.has(item.kind)) reject('unknown_notice_kind');
      const url = item.url === undefined || item.url === null ? null : parseUrl(item.url).href;
      notices.push({ kind: item.kind, note: parseProse(item.note, NOTICE_NOTE_MAX), url });
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      rejected.push({ shopId, where: `notices[${i}]`, reason: error.message });
      // A notice that fails to parse may be the warning itself, so its shop still gets individual review.
      notices.push({ kind: 'suspected_injection', note: 'a notice was unreadable', url: null });
    }
  });
  return notices;
}

function parseProposal(raw, shop, requested, tagsBySlug, today, notices) {
  requireKeys(raw, ['field', 'value', 'evidence'], ['estimated']);
  if (raw.estimated !== undefined && typeof raw.estimated !== 'boolean') reject('invalid_estimated');
  const estimated = raw.estimated === true;
  if (estimated && raw.field !== 'name_kana') reject('only_readings_can_be_estimated');
  if (estimated && shop.nameKana) reject('estimate_cannot_replace_reading');
  const value = parseValue(raw.field, raw.value, shop, tagsBySlug, today);
  const checkField = checkFieldOf(raw.field, value);
  if (!requested.has(checkField)) reject('field_not_requested');
  const evidence = parseEvidence(raw.evidence, checkField, estimated, today);
  if (raw.field === 'business_hours') {
    value.checkedOn = evidence.map((item) => item.observedAt).toSorted().at(-1);
  }
  return {
    field: raw.field,
    checkField,
    value,
    estimated,
    evidence,
    reviewReasons: reviewReasonsOf(raw.field, value, estimated, evidence, notices, shop),
  };
}

function contestedFields(rawProposals) {
  const values = new Map();
  for (const item of rawProposals) {
    if (!SINGLE_VALUE_FIELDS.has(item?.field)) continue;
    values.set(item.field, (values.get(item.field) ?? new Set()).add(JSON.stringify(item.value)));
  }
  return new Set([...values].filter(([, distinct]) => distinct.size > 1).map(([field]) => field));
}

function validateShopResult(raw, shop, batch, tagsBySlug, today, output) {
  const { rejected, accepted } = output;
  const shopId = shop.id;
  requireKeys(raw, ['shopId', 'checks', 'proposals', 'notices', 'tagCandidates']);
  if (raw.shopId !== shopId) reject('shop_id_mismatch');
  if (!isPlainObject(raw.checks) || !Array.isArray(raw.proposals) || !Array.isArray(raw.tagCandidates)) {
    reject('invalid_result_shape');
  }

  const requested = new Set(batch.fields);
  for (const key of Object.keys(raw.checks)) if (!requested.has(key)) reject('check_not_requested');

  const notices = parseNotices(raw.notices, shopId, rejected);
  const failedFields = new Set();
  const proposals = [];
  const contested = contestedFields(raw.proposals);
  const seen = new Set();
  let linkCount = shop.links.length;
  let tagCount = 0;
  let tabelogProposed = false;

  raw.proposals.forEach((item, i) => {
    const where = `proposals[${i}]`;
    try {
      if (contested.has(item?.field)) reject('conflicting_values_for_field');
      const proposal = parseProposal(item, shop, requested, tagsBySlug, today, notices);
      if (raw.checks[proposal.checkField] !== 'found') reject('proposal_without_found_check');
      if (isNoop(proposal.field, proposal.value, shop)) return;
      // A link is its address, so one URL under two labels is one proposal.
      const keyValue = proposal.field === 'link' ? { type: proposal.value.type, url: proposal.value.url } : proposal.value;
      const key = dedupeKey(shopId, proposal.field, keyValue);
      if (seen.has(key)) return;
      if (proposal.field === 'link') {
        if (++linkCount > MAX_LINKS) reject('too_many_links');
        if (proposal.value.type === 'tabelog') {
          if (tabelogProposed || shop.links.some((link) => link.type === 'tabelog')) reject('second_tabelog_link');
          tabelogProposed = true;
        }
      }
      if (proposal.field === 'tag' && ++tagCount > MAX_TAG_PROPOSALS) reject('too_many_tags');
      seen.add(key);
      proposals.push({ ...proposal, key });
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      rejected.push({ shopId, where, reason: error.message });
      const field = rawCheckField(item);
      if (typeof field === 'string') failedFields.add(field);
    }
  });

  const drop = (field, reason) => {
    proposals.splice(proposals.findIndex((proposal) => proposal.field === field), 1);
    rejected.push({ shopId, where: `proposals.${field}`, reason });
    failedFields.add(field);
  };
  // parseValue checks each date against the batch. These two are new in this result, so only here do they meet.
  const proposedValue = (field) => proposals.find((proposal) => proposal.field === field)?.value;
  const opened = proposedValue('opened_at');
  const closed = proposedValue('closed_at');
  if (opened && closed && opened > closed) {
    drop('opened_at', 'opened_after_closed');
    drop('closed_at', 'closed_before_opened');
  }
  if (closed && proposedValue('temporary_closure')) drop('temporary_closure', 'closure_on_closed_shop');

  for (const field of batch.fields) {
    const outcome = raw.checks[field];
    let final = outcome;
    if (!OUTCOMES.has(outcome)) {
      rejected.push({ shopId, where: `checks.${field}`, reason: 'missing_or_invalid_outcome' });
      final = 'error';
    } else if (failedFields.has(field)) {
      final = 'error';
    } else if (outcome === 'found') {
      const proposed = raw.proposals.some((item) => rawCheckField(item) === field);
      if (!proposed && !hasCurrentValue(field, shop)) {
        rejected.push({ shopId, where: `checks.${field}`, reason: 'found_without_value' });
        final = 'error';
      }
    }
    accepted.push({ kind: 'check', runId: batch.runId, shopId, field, outcome: final, checkedAt: today });
  }

  for (const proposal of proposals) {
    accepted.push({
      kind: 'proposal',
      runId: batch.runId,
      shopId,
      field: proposal.field,
      baseValue: baseValueOf(proposal.field, shop),
      proposedValue: proposal.value,
      evidence: proposal.evidence,
      estimated: proposal.estimated,
      reviewReasons: proposal.reviewReasons,
      dedupeKey: proposal.key,
    });
  }
  for (const { kind, note, url } of notices) {
    accepted.push({ kind: 'notice', runId: batch.runId, shopId, noticeKind: kind, note, url });
  }

  raw.tagCandidates.slice(0, MAX_TAG_CANDIDATES).forEach((candidate, i) => {
    try {
      accepted.push({ kind: 'tag_candidate', runId: batch.runId, shopId, label: parseProse(candidate, CANDIDATE_MAX) });
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      rejected.push({ shopId, where: `tagCandidates[${i}]`, reason: error.message });
    }
  });
}

export function parseBatch(text) {
  const batch = JSON.parse(text);
  if (batch.schemaVersion !== 1 || typeof batch.runId !== 'string') throw new Error('Unsupported batch file');
  if (!Array.isArray(batch.fields) || !batch.fields.every((field) => CHECK_FIELDS.includes(field))) {
    throw new Error('Batch has unknown fields');
  }
  if (!Array.isArray(batch.shops) || !Array.isArray(batch.tags)) throw new Error('Batch has no shops or tags');
  for (const shop of batch.shops) {
    if (!/^[0-9a-f-]{36}$/.test(shop.id)) throw new Error('Batch has a malformed shop id');
  }
  return batch;
}

/**
 * Turns one batch's untrusted per-shop result text into canonical records. Rejection records hold only
 * static reason codes, so showing them to an agent passes no web text back to it.
 * `readResult` returns the raw text for a shop id, or null when that shop has no usable result.
 */
export function validateResults({ batch, readResult, today }) {
  parseDate(today);
  const tagsBySlug = new Map(batch.tags.map((tag) => [tag.slug, tag]));
  const output = { accepted: [], rejected: [] };
  for (const shop of batch.shops) {
    const scratch = { accepted: [], rejected: [] };
    try {
      const text = readResult(shop.id);
      if (text === null) {
        output.rejected.push({ shopId: shop.id, where: 'file', reason: 'missing_result' });
        continue;
      }
      if (Buffer.byteLength(text) > MAX_RESULT_BYTES) reject('result_too_large');
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        reject('invalid_json');
      }
      validateShopResult(raw, shop, batch, tagsBySlug, today, scratch);
      output.accepted.push(...scratch.accepted);
      output.rejected.push(...scratch.rejected);
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      output.rejected.push({ shopId: shop.id, where: 'result', reason: error.message });
    }
  }
  return output;
}

function readResultFile(dir, shopId) {
  const path = join(dir, `${shopId}.json`);
  // lstat keeps a symlink planted in the results directory from reading a file outside it.
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) return null;
    // Before reading: a planted huge file must fail its own shop, not the whole batch.
    if (stat.size > MAX_RESULT_BYTES) reject('result_too_large');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return readFileSync(path, 'utf8');
}

const toJsonl = (records) => records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');

function main(args) {
  // The isolated environment passes this: a file named accepted.jsonl must only ever come from the trusted side.
  const rejectionsOnly = args.includes('--rejections-only');
  const [batchPath, resultsDir, outDir] = args.filter((arg) => arg !== '--rejections-only');
  if (!batchPath || !resultsDir || !outDir) {
    console.error('Usage: validate-results.mjs <batch.json> <results-dir> <out-dir> [--rejections-only]');
    return 2;
  }
  const batch = parseBatch(readFileSync(batchPath, 'utf8'));
  const { accepted, rejected } = validateResults({
    batch,
    readResult: (shopId) => readResultFile(resultsDir, shopId),
    today: todayInJapan(),
  });
  mkdirSync(outDir, { recursive: true });
  if (!rejectionsOnly) writeFileSync(join(outDir, 'accepted.jsonl'), toJsonl(accepted));
  writeFileSync(join(outDir, 'rejected.jsonl'), toJsonl(rejected));
  const count = (kind) => accepted.filter((record) => record.kind === kind).length;
  console.log(
    `shops=${batch.shops.length} proposals=${count('proposal')} checks=${count('check')} notices=${count('notice')} rejected=${rejected.length}`,
  );
  const suspected = accepted.filter((record) => record.noticeKind === 'suspected_injection');
  console.log(`suspected_injection_shops=${[...new Set(suspected.map((record) => record.shopId))].join(',')}`);
  return rejected.length ? 1 : 0;
}

// realpath: run through a symlink or junction, a plain comparison fails and the command silently does nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
