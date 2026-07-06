// Re-export prompt builders from packages/core.
// Keeps import paths stable if core is restructured.
export { buildStoryPrompt, STORY_V1_VERSION } from '@reels/core/prompts/story.v1'
export {
  buildStoryCriticPrompt,
  STORY_CRITIC_V1_VERSION,
  StoryCriticSchema,
  DEFAULT_TASTE_RUBRIC,
} from '@reels/core/prompts/story-critic.v1'
export { buildSoundDesignerPrompt, SOUND_DESIGNER_V1_VERSION, SoundDesignSchema, type DesignerScene } from '@reels/core/prompts/sound-designer.v1'
export { buildScenesPrompt, SCENES_V1_VERSION } from '@reels/core/prompts/scenes.v1'
export { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION } from '@reels/core/prompts/story-analyzer.v1'
export { buildRephrasePrompt, REPHRASE_V1_VERSION } from '@reels/core/prompts/rephrase.v1'
export { buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema } from '@reels/core/prompts/peak-extract.v1'
export { buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema } from '@reels/core/prompts/image-qa.v1'
export { buildFilterSafePrompt, FILTER_SAFE_V1_VERSION, FilterSafeSchema } from '@reels/core/prompts/filter-safe.v1'
export { buildVideoQAPrompt, VIDEO_QA_V1_VERSION, VideoQASchema } from '@reels/core/prompts/video-qa.v1'
export { buildCompilationPrompt, COMPILATION_V1_VERSION } from '@reels/core/prompts/compilation.v1'
