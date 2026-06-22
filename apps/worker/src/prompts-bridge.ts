// Re-export prompt builders from packages/core.
// Keeps import paths stable if core is restructured.
export { buildStoryPrompt, STORY_V1_VERSION } from '@reels/core/prompts/story.v1'
export { buildAudioScriptPrompt, AUDIOSCRIPT_V1_VERSION } from '@reels/core/prompts/audioscript.v1'
export { buildScenesPrompt, SCENES_V1_VERSION } from '@reels/core/prompts/scenes.v1'
export { buildRephrasePrompt, REPHRASE_V1_VERSION } from '@reels/core/prompts/rephrase.v1'
export { buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema } from '@reels/core/prompts/peak-extract.v1'
export { buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema } from '@reels/core/prompts/image-qa.v1'
export { buildCompilationPrompt, COMPILATION_V1_VERSION } from '@reels/core/prompts/compilation.v1'
