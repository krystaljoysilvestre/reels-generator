// Re-export prompt builders from packages/core.
// Keeps import paths stable if core is restructured.
export { buildStoryPrompt, STORY_V1_VERSION } from '@reels/core/prompts/story.v1'
export {
  buildStoryCriticPrompt,
  STORY_CRITIC_V1_VERSION,
  StoryCriticSchema,
  DEFAULT_TASTE_RUBRIC,
} from '@reels/core/prompts/story-critic.v1'
// ── Studio pipeline (story-writer-v2 pivot, 2026-07-15): Planner → Writer → Editor → Naturalizer → Gate ──
export { buildStoryWriterPrompt, STORY_V2_VERSION } from '@reels/core/prompts/story.v2'
export { defaultAudienceDescriptor } from '@reels/core/prompts/story-craft.v1'
export {
  buildStoryPlannerPrompt,
  STORY_PLANNER_V1_VERSION,
  StoryPlanSchema,
  resolvePlannerGenre,
  type StoryPlan,
} from '@reels/core/prompts/story-planner.v1'
export {
  STORY_ELEMENTS_V1_VERSION,
  StoryElementsSchema,
  elementFingerprint,
  type StoryElements,
} from '@reels/core/prompts/story-elements.v1'
export {
  STORY_STYLES_V1_VERSION,
  resolveStyle,
  renderStyleForPlanner,
  renderStyleTellingForWriter,
  type StyleInfluence,
} from '@reels/core/prompts/story-styles.v1'
export {
  STORY_VOICES_V1_VERSION,
  resolveVoice,
  renderVoice,
} from '@reels/core/prompts/story-voices.v1'
export { buildStoryEditorPrompt, STORY_EDITOR_V1_VERSION, StoryEditSchema } from '@reels/core/prompts/story-editor.v1'
export { buildStoryNaturalizerPrompt, STORY_NATURALIZER_V1_VERSION, StoryNaturalizeSchema } from '@reels/core/prompts/story-naturalizer.v1'
export {
  buildStoryGatePrompt,
  STORY_CRITIC_V2_VERSION,
  StoryGateSchema,
  defaultTasteRubric,
} from '@reels/core/prompts/story-critic.v2'
// Plan-level judge-and-force (OPT-IN, 2026-07-20): the plan gate + the plan doctor run BETWEEN the
// planner and the writer when a channel opts into agency-driven planning (see generate-story.ts).
export {
  buildStoryPlanCriticPrompt,
  STORY_PLAN_CRITIC_V1_VERSION,
  PlanCriticSchema,
} from '@reels/core/prompts/story-plan-critic.v1'
export {
  buildStoryPlanDoctorPrompt,
  STORY_PLAN_DOCTOR_V1_VERSION,
  PlanDoctorSchema,
} from '@reels/core/prompts/story-plan-doctor.v1'
// Finishing QA judge (2026-07-20): a detection-only per-story punch-list surfaced at story_review.
export {
  buildStoryFinishingJudgePrompt,
  STORY_FINISHING_JUDGE_V1_VERSION,
  FinishingJudgeSchema,
  type FinishingIssue,
} from '@reels/core/prompts/story-finishing-judge.v1'
// Evidence-Based Narrative (2026-07-21): dossier → extractor → Evidence Bible → planner(claims) →
// writer(cited) → Fact-Fidelity Checker. Probe-validated; not yet wired into a live pipeline path.
export {
  buildEbnExtractorPrompt,
  STORY_EBN_EXTRACTOR_V1_VERSION,
  EvidenceBibleSchema,
  EbnFactSchema,
  type EbnFact,
} from '@reels/core/prompts/story-ebn-extractor.v1'
export { buildEbnPlannerPrompt, STORY_EBN_PLANNER_V1_VERSION, EbnClaimsSchema } from '@reels/core/prompts/story-ebn-planner.v1'
export {
  buildEbnWriterPrompt,
  STORY_EBN_WRITER_V1_VERSION,
  EbnWriterSchema,
  TRUE_CRIME_PERMISSIONS,
  type EbnPermissions,
} from '@reels/core/prompts/story-ebn-writer.v1'
export { buildEbnFidelityPrompt, STORY_EBN_FIDELITY_V1_VERSION, EbnFidelitySchema, type EbnFidelityVerdict } from '@reels/core/prompts/story-ebn-fidelity.v1'
export { buildSoundDesignerPrompt, SOUND_DESIGNER_V1_VERSION, SoundDesignSchema, type DesignerScene } from '@reels/core/prompts/sound-designer.v1'
export { buildScenesPrompt, SCENES_V1_VERSION } from '@reels/core/prompts/scenes.v1'
export { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION } from '@reels/core/prompts/story-analyzer.v1'
export { buildRephrasePrompt, REPHRASE_V1_VERSION } from '@reels/core/prompts/rephrase.v1'
export { buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema } from '@reels/core/prompts/peak-extract.v1'
export { buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema } from '@reels/core/prompts/image-qa.v1'
export { buildFilterSafePrompt, FILTER_SAFE_V1_VERSION, FilterSafeSchema } from '@reels/core/prompts/filter-safe.v1'
export { buildVideoQAPrompt, VIDEO_QA_V1_VERSION, VideoQASchema } from '@reels/core/prompts/video-qa.v1'
export { buildFoleySpotPrompt, FOLEY_SPOT_V1_VERSION, FoleySpotSchema } from '@reels/core/prompts/foley-spot.v1'
export { buildCompilationPrompt, COMPILATION_V1_VERSION } from '@reels/core/prompts/compilation.v1'
export { buildPostMetaPrompt, PostMetaLlmSchema, POST_META_V1_VERSION } from '@reels/core/prompts/post-meta.v1'
export {
  buildPlaceSourceDecidePrompt,
  buildPlaceVerifyPrompt,
  PlaceSourceDecisionSchema,
  PlaceVerifySchema,
  PLACE_SOURCE_V1_VERSION,
} from '@reels/core/prompts/place-source.v1'
