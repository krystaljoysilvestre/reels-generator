import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ─────────────────────────────────────────────────────────────────────

export const reelStatusEnum = pgEnum('reel_status', [
  'drafting',
  'story_review',  // primary human gate — pipeline paused
  'bible_review',  // gate after analyze_story — operator reviews the cast/places before any image is rendered
  'storyboard',    // assisted editing in the storyboard editor
  'rendering',     // steps 4–10 running
  'render_qa',     // automated QA checks
  'spot_check',    // operator spot-check sample
  'approved',
  'scheduled',
  'published',
  'rejected',
  'failed',
])

export const pipelineStepStatusEnum = pgEnum('pipeline_step_status', [
  'pending',
  'running',
  'done',
  'failed',
  'skipped', // idempotency skip: same input_hash already completed
])

export const assetKindEnum = pgEnum('asset_kind', [
  'image',
  'video',
  'voiceover',
  'sfx',
  'ambient',
  'music',
  'render',
  'stem', // a single mix layer (voice/music/sfx/ambient) persisted alongside the final mix for rebalancing
])

export const storySourceEnum = pgEnum('story_source', [
  'user',        // operator-written
  'ai',          // pipeline-generated
  'remix',       // based on a saved story
  'submission',  // UGC from audience
])

export const platformEnum = pgEnum('platform', ['fb', 'ig', 'yt', 'tiktok'])

export const compilationStatusEnum = pgEnum('compilation_status', [
  'drafting',
  'rendering',
  'render_qa',
  'approved',
  'published',
  'failed',
])

export const rejectionReasonEnum = pgEnum('rejection_reason', [
  'twist_predictable',
  'voice_mismatch',
  'visual_off',
  'pacing',
  'weak_hook',
  'off_culture',
  'other',
])

// ── channels ─────────────────────────────────────────────────────────────────

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Owning user (multi-tenancy). Nullable: legacy rows predate auth and are backfilled to the admin
  // in migration 0040; every new channel sets it. onDelete set null so removing a user never
  // silently destroys their content.
  userId: uuid('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  avatarKey: text('avatar_key'),   // optional R2 key for the channel avatar image
  description: text('description'), // optional short blurb shown on the card/header
  nicheDescription: text('niche_description').notNull(),
  tagline: text('tagline').notNull().default(''),  // AI-derived one-line positioning (shown in UI)
  languages: text('languages').array().notNull().default(['tagalog']),
  toneConfig: jsonb('tone_config').notNull().default({}),
  stylePreset: text('style_preset').notNull().default(''),
  styleImageKey: text('style_image_key'),  // optional R2 key for the chosen visual-style sample
  targetSeconds: integer('target_seconds').notNull().default(75),  // per-channel reel length (AI-derived per niche, operator-adjustable)
  targetPlatform: text('target_platform').notNull().default('all'),  // tiktok | youtube_shorts | facebook_reels | all — shapes caption/length now, render presets later
  worldBible: jsonb('world_bible').notNull().default({}),
  // Genre bucket (horror | informational | lifestyle | drama | commentary | reddit_story | comedy |
  // general) — LLM-derived at creation (channel.v1). Picks the WRITER identity for story generation
  // AND which genre module the scene-prompt builder loads. Defaults to 'general' so pre-existing
  // channels stay neutral; consumers keyword-classify (classifyGenre) as a secondary fallback.
  genreCategory: text('genre_category').notNull().default('general'),
  // PROSE dimensions (story-writer-v2): the storytelling TRADITION + the narrator's written SOUND,
  // layered on genre by the Planner/Writer. Per-channel, operator-selectable. NOT the TTS/audio voice
  // (voiceId/voiceMode/voicePool/voiceSearchKeyword) and NOT the visual look (stylePreset/lutConfig).
  // narrativeStyle is scoped to the genre (see story-styles.v1); empty = pure genre. narrativeVoice is
  // cross-genre (story-voices.v1); empty = the genre writer-identity's default sound. styleInfluence
  // scales how hard to lean into the style (ignored when narrativeStyle is empty).
  narrativeStyle: text('narrative_style').notNull().default(''),
  narrativeVoice: text('narrative_voice').notNull().default(''),
  styleInfluence: text('style_influence').notNull().default('medium'), // light | medium | full
  lutConfig: jsonb('lut_config').notNull().default({}),
  captionStyle: jsonb('caption_style').notNull().default({}),  // per-channel burned-in caption look (resolved CaptionStyle)
  voiceMode: text('voice_mode').notNull().default('single'),  // 'single' | 'per_story'
  voiceSearchKeyword: text('voice_search_keyword').notNull().default(''),  // AI-derived genre tag for matching/recommending narrator voices
  voicePool: jsonb('voice_pool').notNull().default([]),        // selected real ElevenLabs voices
  watermarkKey: text('watermark_key'),                          // optional per-channel watermark override (R2 key); null = use the app default logo
  audioPacks: jsonb('audio_packs').notNull().default({}),
  postingRules: jsonb('posting_rules').notNull().default({}),
  costCents: integer('cost_cents').notNull().default(0), // what creating this channel cost us (derive + style options/previews)
  // Lifecycle: 'active' = a finished channel; 'draft' = an in-progress wizard the operator saved to
  // resume later. Drafts keep their unfinished wizard state in `draftState`, are shown separately on
  // the dashboard, and are promoted to 'active' (draftState cleared) when the wizard is finished.
  status: text('status').notNull().default('active'),
  draftState: jsonb('draft_state'),  // wizard state blob for resuming a draft; null once active
  // How reels are produced: 'review' = stop at the human gates (story / storyboard / spot-check);
  // 'auto' = run end-to-end through to a finished render, no stops. Set on the first reel, editable in
  // Settings. (Publishing stays manual either way.)
  generationMode: text('generation_mode').notNull().default('review'),
  // Operator-editable taste rubric the story critic ranks candidates against.
  // Null = use the hand-written default (DEFAULT_TASTE_RUBRIC in story-critic.v1).
  tasteRubric: text('taste_rubric'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── stories ───────────────────────────────────────────────────────────────────

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    source: storySourceEnum('source').notNull().default('ai'),
    language: text('language').notNull().default('tagalog'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    logline: text('logline'),
    twistAnchor: text('twist_anchor'),
    subgenreTags: text('subgenre_tags').array().notNull().default([]),
    // Story-elements labels the planner recorded for this story (structure/pov/role/setting/
    // anchor/trigger/turn/aftereffect/tensionCurve — see story-elements.v1). Planner METADATA
    // for variety + analytics; never a Writer instruction. Nullable: pre-elements + BYO stories
    // are null and simply don't participate in the fingerprint avoid-list.
    elements: jsonb('elements'),
    performanceScore: integer('performance_score').notNull().default(0),
    isReference: boolean('is_reference').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({ idxChannel: index('idx_stories_channel').on(t.channelId) }),
)

// ── reels ─────────────────────────────────────────────────────────────────────

export const reels = pgTable(
  'reels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'set null' }),
    status: reelStatusEnum('status').notNull().default('drafting'),
    language: text('language').notNull().default('tagalog'),
    voiceId: text('voice_id'),
    audioScript: jsonb('audio_script'),   // annotated audio script (docs/04 §3)
    // Per-reel Story Bible (StoryBible) — the symbol table of recurring entities the scene breakdown
    // references and the assembler splices for visual continuity (see specs/story-bible.md). Written by
    // analyze_story; null = not yet analyzed (the pipeline degrades to invent-inline, never fails).
    storyBible: jsonb('story_bible'),
    timings: jsonb('timings'),             // ComputeTimingsOutput (docs/08)
    voiceSettings: jsonb('voice_settings'), // per-reel narrator DELIVERY override (ElevenLabs voice_settings); null = auto-derive from the story's mood
    musicKey: text('music_key'),           // R2 key of THIS reel's single AI bed (musicMode='ai'); null otherwise
    musicKeyB: text('music_key_b'),         // DORMANT — legacy climax bed from the old two-section score; no longer written or read (single-bed now). Safe to drop in a dedicated migration.
    musicMood: text('music_mood'),          // per-reel background-music mood override (MusicMood enum); null = inherit the channel default
    musicUploadKey: text('music_upload_key'), // per-reel operator-UPLOADED bed (R2 key); when set it overrides AI gen / preset pool at render. Rights are the operator's — we don't clear them.
    musicLengthMs: integer('music_length_ms'), // length the bed was generated at; the mixer loops to cover the reel
    // Audio direction notes — free-text, one cue per line (e.g. "Door opens softly.", "Female voice from
    // a nearby stall repeats the narrator's line."). Auto-drafted by the enrichment pass after the script
    // is written, fully operator-editable. The narration is never touched. At render the interpreter turns
    // these notes into placed audio (operatorSfx below).
    soundNotes: text('sound_notes').notNull().default(''),
    // Realized cues (OperatorCue[]) — the interpreter's structured output from soundNotes: SFX one-shots and
    // short off-screen voice lines, anchored to narration. Merged into the SFX list at compute_timings +
    // generate_sfx. Internal — the operator only ever sees/edits soundNotes.
    operatorSfx: jsonb('operator_sfx').notNull().default([]),
    // Per-reel video effects: null = auto (planned from the story's mood + genre at render); an array of
    // effect ids (e.g. ['vhs','glitch']) = the operator's explicit choice, applied across the reel.
    videoEffects: jsonb('video_effects'),
    renderUrl: text('render_url'),
    // Optional operator topic seed for THIS reel's story ("make one about the aswang sa palengke").
    // Read by generate_story → planner; null = the planner explores freely. Never mutated after creation.
    seedIdea: text('seed_idea'),
    // Post metadata (PostMeta) — platform title, hook, caption, hashtags for this reel, written by the
    // generate_post_meta step (regenerates when the story changes) and operator-editable. Consumed by
    // the export post-package. Null = not yet generated (export falls back to a lazy generation).
    postMeta: jsonb('post_meta'),
    // Manually-logged platform performance (ReelMetrics: views/likes/comments + recordedAt). Feeds
    // stories.performanceScore (channel-relative), which weights few-shot reference selection.
    metrics: jsonb('metrics'),
    // Needs-attention note shown on the channel page when an auto-mode reel stalls (e.g. no narrator
    // voice could be auto-picked). Cleared when the operator resolves it (e.g. triggers the render).
    alertNote: text('alert_note'),
    costCents: integer('cost_cents').notNull().default(0),
    operatorMinutes: integer('operator_minutes').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    idxChannel: index('idx_reels_channel').on(t.channelId),
    idxStatus: index('idx_reels_status').on(t.status),
  }),
)

// ── compilations ──────────────────────────────────────────────────────────────

export const compilations = pgTable('compilations', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  theme: text('theme'),
  reelIds: uuid('reel_ids').array().notNull().default([]),
  introScript: text('intro_script'),
  transitions: jsonb('transitions').notNull().default([]),
  chapterMarks: jsonb('chapter_marks').notNull().default([]),
  status: compilationStatusEnum('status').notNull().default('drafting'),
  renderUrl: text('render_url'),
  costCents: integer('cost_cents').notNull().default(0),
  youtubeVideoId: text('youtube_video_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── scenes ────────────────────────────────────────────────────────────────────

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reelId: uuid('reel_id')
      .notNull()
      .references(() => reels.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    // Full contiguous narration substring (docs/08 [M9] — not a "start…end" marker)
    narrationText: text('narration_text').notNull(),
    visualPrompt: text('visual_prompt'),  // content only, style injected server-side
    // The pristine scenes-generation prompt, frozen at breakdown and never touched by regens. `visualPrompt`
    // accumulates "vary + instruction" revisions; this preserves the original so "Fresh take" can re-roll
    // from the scene as first written. Null on pre-migration scenes → callers fall back to `visualPrompt`.
    visualPromptBase: text('visual_prompt_base'),
    motionPrompt: text('motion_prompt'),
    // Optional on-screen text — a title/overlay burned onto this scene at render, separate from the
    // spoken captions (which come from narrationText). Null/empty = no overlay.
    onScreenText: text('on_screen_text'),
    // Per-scene motion quality/length for animation (jsonb: { quality, durationSec }). Null = defaults
    // (standard model, 5s). Read by the on-demand preview and the render-time animate step.
    motionSettings: jsonb('motion_settings'),
    tier: text('tier').notNull().default('still'), // 'still' | 'video'
    // Durable "this is a key visual beat" flag, set at breakdown = the LLM's video designation. Unlike
    // `tier` (which the Motion toggle and regen mutate), this stays put so the hero marker persists.
    isHero: boolean('is_hero').notNull().default(false),
    // FK to assets with ON DELETE SET NULL: if the referenced asset is deleted, the pointer nulls out
    // (render falls back to a black placeholder) instead of dangling. `assets` is declared below — the
    // thunk resolves lazily, so the forward reference is fine.
    imageAssetId: uuid('image_asset_id').references((): AnyPgColumn => assets.id, { onDelete: 'set null' }),
    videoAssetId: uuid('video_asset_id').references((): AnyPgColumn => assets.id, { onDelete: 'set null' }),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
    mood: text('mood').array().notNull().default([]),
    // Canonical place label (e.g. "rented bedroom"). Scenes sharing a location are kept visually
    // continuous: the location's first scene is the anchor, the rest are image-to-image'd from it.
    location: text('location'),
    // Story Bible references (see specs/story-bible.md). The breakdown emits entity IDS; the image
    // assembler splices their frozen canonical descriptions so recurring elements don't drift.
    primaryEntity: text('primary_entity'),                                  // the bible id the shot leads with; null = un-canonical subject
    supportingEntities: text('supporting_entities').array().notNull().default([]), // other bible ids in frame
    sceneIntent: text('scene_intent'),                                       // "what the audience should notice first"
  },
  (t) => ({
    idxReel: index('idx_scenes_reel').on(t.reelId),
    idxReelIdx: uniqueIndex('idx_scenes_reel_idx').on(t.reelId, t.idx),
  }),
)

// ── assets ────────────────────────────────────────────────────────────────────

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reelId: uuid('reel_id').references(() => reels.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    kind: assetKindEnum('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    provider: text('provider').notNull(), // 'openai' | 'elevenlabs' | 'fal' | 'anthropic' | 'local'
    providerJobId: text('provider_job_id'),
    costCents: integer('cost_cents').notNull().default(0),
    meta: jsonb('meta').notNull().default({}), // word timestamps, durations, etc.
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    idxReel: index('idx_assets_reel').on(t.reelId),
    // One row per logical artifact within a reel. Makes the onConflictDoUpdate upserts in the pipeline
    // meaningful (they were silent no-ops without a matching constraint) and bounds duplicate-row growth.
    // reel_id is nullable (app-level assets like style presets); Postgres treats NULLs as distinct, so
    // those rows are unaffected.
    uqReelStorageKey: uniqueIndex('uq_assets_reel_storage_key').on(t.reelId, t.storageKey),
  }),
)

// ── pipeline_steps ────────────────────────────────────────────────────────────

export const pipelineSteps = pgTable(
  'pipeline_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reelId: uuid('reel_id')
      .notNull()
      .references(() => reels.id, { onDelete: 'cascade' }),
    stepName: text('step_name').notNull(),
    status: pipelineStepStatusEnum('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    // Hash of template version + fully-resolved inputs (docs/08 [M5])
    inputHash: text('input_hash'),
    output: jsonb('output'),
    error: text('error'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
  },
  (t) => ({
    idxReel: index('idx_pipeline_steps_reel').on(t.reelId),
    idxReelStep: uniqueIndex('idx_pipeline_steps_reel_step').on(t.reelId, t.stepName),
  }),
)

// ── publications ──────────────────────────────────────────────────────────────

export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reelId: uuid('reel_id')
      .notNull()
      .references(() => reels.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    platformPostId: text('platform_post_id'),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    status: text('status').notNull().default('pending'),
    disclosureApplied: boolean('disclosure_applied').notNull().default(false),
    killSwitchExpiresAt: timestamp('kill_switch_expires_at'),
  },
  (t) => ({ idxReel: index('idx_publications_reel').on(t.reelId) }),
)

// ── metrics ───────────────────────────────────────────────────────────────────

export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationId: uuid('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at').notNull().defaultNow(),
    views: integer('views').notNull().default(0),
    qualifiedViews: integer('qualified_views').notNull().default(0),
    avgWatchPct: integer('avg_watch_pct').notNull().default(0),
    retention3s: integer('retention_3s').notNull().default(0),
    followersDelta: integer('followers_delta').notNull().default(0),
    revenueCents: integer('revenue_cents').notNull().default(0),
    raw: jsonb('raw').notNull().default({}),
  },
  // Append-only growth table joined to publications on this FK — index it before metrics polling lands.
  (t) => ({ idxPublication: index('idx_metrics_publication').on(t.publicationId) }),
)

// ── rejections ────────────────────────────────────────────────────────────────

export const rejections = pgTable('rejections', {
  id: uuid('id').primaryKey().defaultRandom(),
  reelId: uuid('reel_id')
    .notNull()
    .references(() => reels.id, { onDelete: 'cascade' }),
  reasonCode: rejectionReasonEnum('reason_code').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ── Auth & tenancy (Auth.js Drizzle adapter tables + app extensions) ───────────

// The adapter accesses these by their drizzle property names (id/email/emailVerified/… on users;
// provider/providerAccountId/refresh_token/… on accounts), so those names must match its contract;
// DB column names stay snake_case per repo convention. ids are uuid to line up with existing FKs.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  // App extensions (not part of the adapter contract):
  role: text('role').notNull().default('tester'),      // 'admin' | 'tester'
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'suspended'
  passwordHash: text('password_hash'),                 // null for SSO-only accounts
  lastSeenAt: timestamp('last_seen_at'),
  // Per-user cost/quota caps (multi-tenant safety). Null → the global DEFAULT_USER_LIMITS in core;
  // set to override for a specific user (admin action / future plan tiering).
  monthlyBudgetCents: integer('monthly_budget_cents'),
  dailyReelQuota: integer('daily_reel_quota'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<'oauth' | 'oidc' | 'email' | 'webauthn'>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (account) => ({
  compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
}))

// Present for adapter completeness; unused under the JWT session strategy.
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (vt) => ({
  compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
}))

// Invite links — pre-approve a signup with a role; consumed once (usedAt/usedByUserId set on accept).
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  email: text('email'),                                 // optional: bind the invite to an address
  role: text('role').notNull().default('tester'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at'),
  usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  channels: many(channels),
}))

export const channelsRelations = relations(channels, ({ one, many }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
  stories: many(stories),
  reels: many(reels),
  compilations: many(compilations),
}))

export const storiesRelations = relations(stories, ({ one, many }) => ({
  channel: one(channels, { fields: [stories.channelId], references: [channels.id] }),
  reels: many(reels),
}))

export const reelsRelations = relations(reels, ({ one, many }) => ({
  channel: one(channels, { fields: [reels.channelId], references: [channels.id] }),
  story: one(stories, { fields: [reels.storyId], references: [stories.id] }),
  scenes: many(scenes),
  assets: many(assets),
  pipelineSteps: many(pipelineSteps),
  publications: many(publications),
  rejections: many(rejections),
}))

export const pipelineStepsRelations = relations(pipelineSteps, ({ one }) => ({
  reel: one(reels, { fields: [pipelineSteps.reelId], references: [reels.id] }),
}))

// Inverse (one) sides — required for Drizzle to infer each many() relation above.
export const scenesRelations = relations(scenes, ({ one }) => ({
  reel: one(reels, { fields: [scenes.reelId], references: [reels.id] }),
}))

export const assetsRelations = relations(assets, ({ one }) => ({
  reel: one(reels, { fields: [assets.reelId], references: [reels.id] }),
  channel: one(channels, { fields: [assets.channelId], references: [channels.id] }),
}))

export const publicationsRelations = relations(publications, ({ one, many }) => ({
  reel: one(reels, { fields: [publications.reelId], references: [reels.id] }),
  metrics: many(metrics),
}))

export const metricsRelations = relations(metrics, ({ one }) => ({
  publication: one(publications, { fields: [metrics.publicationId], references: [publications.id] }),
}))

export const rejectionsRelations = relations(rejections, ({ one }) => ({
  reel: one(reels, { fields: [rejections.reelId], references: [reels.id] }),
}))

export const compilationsRelations = relations(compilations, ({ one }) => ({
  channel: one(channels, { fields: [compilations.channelId], references: [channels.id] }),
}))
