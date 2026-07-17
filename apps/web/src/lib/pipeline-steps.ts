import { PIPELINE_STEPS, type PipelineStepName } from '@reels/core'

export { PIPELINE_STEPS }

export function stepLabel(name: PipelineStepName | string): string {
  const labels: Record<string, string> = {
    generate_story:       'Story',
    review_story:         'Review',
    annotate_audio_script:'Audio script',
    analyze_story:        'Story bible',
    generate_post_meta:   'Post package',
    breakdown_scenes:     'Scenes',
    generate_images:      'Images',
    generate_tts:         'Voiceover',
    compute_timings:      'Timings',
    generate_sfx:         'SFX',
    animate_scenes:       'Animate',
    mix_audio:            'Mix',
    render:               'Render',
    render_qa:            'QA',
    spot_check:           'Spot check',
  }
  return labels[name] ?? name
}

export function stepIndex(name: string): number {
  return PIPELINE_STEPS.indexOf(name as PipelineStepName) + 1
}
