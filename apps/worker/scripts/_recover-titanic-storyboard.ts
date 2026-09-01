// Operator recovery for Crossroads reel #3 after the automatic depiction gate exhausted its retries.
// Persists a manually directed, evidence-safe board without making a paid API call.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, stories, scenes, pipelineSteps, channels, users } = await import('@reels/db')
  const {
    ScenesOutputSchema,
    StoryBibleSchema,
    animatorMotionPrompt,
    appearanceBindingsForScene,
    cameraMovePrompt,
    estimateNarrationSec,
    reviewSceneBreakdown,
    visualTruthContractErrors,
  } = await import('@reels/core')
  const { and, eq } = await import('drizzle-orm')

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.storyId) throw new Error('reel or linked story not found')
  if (reel.status !== 'failed') throw new Error(`expected failed reel, found ${reel.status}`)

  const [story, channel, priorScenes, failedStep] = await Promise.all([
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
    db.query.scenes.findMany({ where: eq(scenes.reelId, REEL_ID) }),
    db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, REEL_ID), eq(pipelineSteps.stepName, 'breakdown_scenes')),
    }),
  ])
  if (!story || !channel?.userId) throw new Error('story or channel owner not found')
  if (priorScenes.length > 0) throw new Error('manual recovery refuses to overwrite existing scenes')
  if (!failedStep || failedStep.status !== 'failed') throw new Error('breakdown_scenes is not failed')

  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const bible = StoryBibleSchema.parse(reel.storyBible)
  const board = ScenesOutputSchema.parse({
    scenes: [
      {
        idx: 1,
        narrationText: 'When Titanic left Southampton, the lookouts genuinely had no binoculars — but the inquiry record does not establish the popular claim that a lost key caused the collision or that glasses would certainly have prevented the sinking.',
        imagePrompt: 'The Titanic ocean liner departs Southampton behind a large empty binocular outline; a plain key silhouette dissolves into a question mark, visibly separating a real absence from an unproven causal legend.',
        cameraMove: 'push_in',
        subjectMotion: 'The key silhouette slowly dissolves into a question mark while the ship moves away from port',
        tier: 'video',
        mood: ['investigative', 'ominous'],
        location: 'southampton-departure',
        primaryEntity: 'titanic',
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Establish immediately that the missing binoculars were real while the lost-key causal story remains unproven.',
      },
      {
        idx: 2,
        narrationText: 'On the Belfast-to-Southampton leg, acting Second Officer Blair had supplied lookouts with binoculars, but at Southampton he had them locked away, and after departure, lookouts who asked for glasses received none.',
        imagePrompt: 'A clean route line runs from Belfast to Southampton: binoculars appear beside the first leg, move into a locked storage symbol at Southampton, then vanish from an empty crow’s-nest equipment rack after departure; no specific historical key or cabinet is shown.',
        cameraMove: 'pan_right',
        subjectMotion: '',
        tier: 'still',
        mood: ['procedural', 'uneasy'],
        location: 'route-diagram',
        primaryEntity: null,
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Show the documented sequence without turning the disputed key story into a staged event.',
      },
      {
        idx: 3,
        narrationText: 'At approximately 11:40 p.m. on April 14, lookout Frederick Fleet spotted the iceberg with unaided eyes, struck the crow\'s-nest bell three times, and called "Iceberg right ahead" to the bridge.',
        imagePrompt: 'A three-part moonless-night sequence: a jagged iceberg shape emerges beyond a crow’s-nest rail; an anonymous distant lookout silhouette pulls a bell rope beside three spreading sound rings; a telephone receiver points toward a simplified bridge outline, with the face never visible.',
        cameraMove: 'push_in',
        subjectMotion: 'The bell rope snaps downward three times as the iceberg edge becomes clearer against the black horizon',
        tier: 'video',
        mood: ['urgent', 'cold'],
        location: 'crow\'s-nest',
        primaryEntity: 'iceberg',
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Depict all three supported actions—sighting, three bells, and the bridge call—without fabricating Fleet’s likeness.',
      },
      {
        idx: 4,
        narrationText: 'Fleet testified that binoculars might have helped him identify an object sooner, yet the Court found their use neither necessary nor usual in the circumstances.',
        imagePrompt: 'A balanced evidence diagram: on the left, binoculars beside a dotted earlier-sighting possibility; on the right, a heavier official finding document beside an unaided eye, making testimony and the Court’s contrary finding visibly distinct without staging a courtroom.',
        cameraMove: 'locked',
        subjectMotion: '',
        tier: 'still',
        mood: ['measured', 'analytical'],
        location: 'evidence-diagram',
        primaryEntity: null,
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Contrast Fleet’s conditional testimony with the Court’s finding instead of collapsing one into the other.',
      },
      {
        idx: 5,
        narrationText: 'Two hours before Fleet rang that bell, the Marconi room received a Mesaba message reporting heavy pack ice, large icebergs, and field ice in coordinates described as Titanic\'s immediate vicinity',
        imagePrompt: 'An active wireless telegraph machine feeds a telegram strip beside a North Atlantic route chart; separate symbols for pack ice, large icebergs, and field ice crowd the ship’s immediate vicinity.',
        cameraMove: 'tilt_down',
        subjectMotion: '',
        tier: 'still',
        mood: ['urgent', 'foreboding'],
        location: 'marconi-room',
        primaryEntity: 'marconi-room',
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Show that the warning was received and make all three reported ice conditions visible.',
      },
      {
        idx: 6,
        narrationText: '— and it never reached Captain Smith or any bridge officer.',
        imagePrompt: 'A wireless telegram route runs solidly into the radio room, then stops at a heavy barrier before a distant bridge outline; the bridge side remains empty, with no captain or officer depicted.',
        cameraMove: 'pull_out',
        subjectMotion: '',
        tier: 'still',
        mood: ['foreboding', 'isolated'],
        location: 'message-route-diagram',
        primaryEntity: null,
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Show the documented communication break without inventing a handoff, recipient, or bridge scene.',
      },
      {
        idx: 7,
        narrationText: 'The inquiry found the Mesaba message might have affected navigation had it reached the bridge.',
        imagePrompt: 'A conditional route diagram branches from one telegram: the solid path stops before the bridge, while a faint dotted alternative bends the ship’s course away from an ice field, clearly presented as a possibility rather than a certain rescue.',
        cameraMove: 'pull_out',
        subjectMotion: '',
        tier: 'still',
        mood: ['reflective', 'uncertain'],
        location: 'conditional-route-diagram',
        primaryEntity: null,
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Preserve the inquiry’s conditional wording: might have affected navigation, not would have prevented the sinking.',
      },
      {
        idx: 8,
        narrationText: 'The Court concluded Titanic\'s loss was caused by collision with an iceberg brought about by the excessive speed at which she was navigated.',
        imagePrompt: 'The Titanic ocean liner and a jagged iceberg sit on a stark navigation diagram; a large speed dial fixed at 22 knots drives a bold trajectory into the collision point, while an official-finding marker anchors the causal chain to excessive speed.',
        cameraMove: 'push_in',
        subjectMotion: '',
        tier: 'still',
        mood: ['grave', 'decisive'],
        location: 'cause-diagram',
        primaryEntity: 'titanic',
        supportingEntities: ['iceberg'],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Land the official cause as the hierarchy’s decisive finding: collision brought about by excessive speed.',
      },
      {
        idx: 9,
        narrationText: 'The missing binoculars are the legend; the Mesaba warning that never left the Marconi room is the documented missed possibility; and 22 knots in known proximity to ice is what the Court called the cause.',
        imagePrompt: 'Three symbolic panels resolve into a hierarchy: a crossed key beside empty binoculars recedes first; a wireless telegram path stopped before a bridge remains in the middle; a dominant ship-speed dial at 22 knots advances toward an ice field in the final panel.',
        cameraMove: 'push_in',
        subjectMotion: 'The key panel fades back, the stopped telegram holds, and the 22-knot speed dial grows to dominate the frame',
        tier: 'video',
        mood: ['resolute', 'somber'],
        location: 'evidence-hierarchy',
        primaryEntity: null,
        supportingEntities: [],
        sourcePresentationEntity: null,
        depictionBasis: 'conceptual',
        appearanceByEntity: {},
        sceneIntent: 'Finish on the exact evidentiary hierarchy: legend, documented missed possibility, official cause.',
      },
    ],
  })

  const normalized = story.body.trim()
  let cursor = 0
  for (const scene of board.scenes) {
    const at = normalized.indexOf(scene.narrationText, cursor)
    if (at < 0) throw new Error(`scene ${scene.idx} narration is not found after cursor ${cursor}`)
    if (normalized.slice(cursor, at).trim()) throw new Error(`gap before scene ${scene.idx}`)
    cursor = at + scene.narrationText.length
  }
  if (normalized.slice(cursor).trim()) throw new Error('board does not cover the end of the narration')

  const seconds = Math.max(channel.targetSeconds ?? 75, estimateNarrationSec(story.body))
  const minScenes = Math.max(3, Math.floor(seconds / 16))
  const maxScenes = Math.min(14, Math.max(minScenes + 1, Math.ceil(seconds / 9) + 1))
  const qa = reviewSceneBreakdown({
    narration: story.body,
    peakMoment: story.twistAnchor ?? '',
    minScenes,
    maxScenes,
    scenes: board.scenes,
    bibleEntities: bible.entities,
    narratorEntityId: bible.continuity.narratorEntityId,
    narratorPerspective: bible.continuity.narratorPerspective,
    journey: bible.continuity.journey,
    maxVideoTiers: 3,
  })
  const truthErrors = board.scenes.flatMap((scene) =>
    visualTruthContractErrors(scene).map((error) => `scene ${scene.idx}: ${error}`),
  )
  if (qa.errors.length || truthErrors.length) {
    throw new Error(`manual board failed validation: ${[...qa.errors, ...truthErrors].join(' | ')}`)
  }

  const overlays = [
    'MYTH: A LOST KEY DOOMED TITANIC?',
    'NO BINOCULARS — TRUE',
    '11:40 PM • BELL ×3',
    'TESTIMONY ≠ FINDING',
    '9:40 PM • MESABA WARNING',
    'NEVER REACHED THE BRIDGE',
    'MIGHT HAVE AFFECTED NAVIGATION',
    'OFFICIAL CAUSE: EXCESSIVE SPEED',
    'LEGEND • MISSED POSSIBILITY • CAUSE',
  ]

  await db.transaction(async (tx) => {
    for (let i = 0; i < board.scenes.length; i++) {
      const scene = board.scenes[i]!
      const appearanceBindings = scene.appearanceByEntity
        ?? appearanceBindingsForScene(bible, story.body, scene.narrationText)
      await tx.insert(scenes).values({
        reelId: REEL_ID,
        idx: i + 1,
        narrationText: scene.narrationText,
        visualPrompt: scene.imagePrompt,
        visualPromptBase: scene.imagePrompt,
        motionPrompt: scene.tier === 'video'
          ? animatorMotionPrompt(scene.cameraMove, scene.subjectMotion)
          : cameraMovePrompt(scene.cameraMove),
        onScreenText: overlays[i],
        tier: scene.tier,
        isHero: scene.tier === 'video',
        mood: scene.mood,
        location: scene.location,
        primaryEntity: scene.primaryEntity,
        supportingEntities: scene.supportingEntities,
        sourcePresentationEntity: scene.sourcePresentationEntity,
        depictionBasis: scene.depictionBasis,
        appearanceBindings,
        sceneIntent: scene.sceneIntent,
      })
    }
    await tx.update(pipelineSteps).set({
      status: 'done',
      error: null,
      output: {
        scenes: board.scenes,
        manualRecovery: {
          reason: 'Automatic depiction gate exhausted three retries by fabricating documentary-looking evidence.',
          method: 'Human-directed conceptual board grounded in the approved narration and frozen Evidence Bible.',
          validator: 'ScenesOutputSchema + narration tiling + deterministic scene QA + visual-truth contract',
          warnings: qa.warnings,
          priorAttempts: failedStep.attempt,
          priorCostCentsPreserved: failedStep.costCents,
          recoveredAt: new Date().toISOString(),
        },
      },
      finishedAt: new Date(),
    }).where(eq(pipelineSteps.id, failedStep.id))
    await tx.update(reels).set({ status: 'storyboard', updatedAt: new Date() }).where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id} recovered storyboard for reel ${REEL_ID} after paid breakdown retries failed closed`)
  console.log(`persisted ${board.scenes.length} scenes; deterministic QA warnings=${qa.warnings.length}; paid cost added=0c`)
  for (const warning of qa.warnings) console.log(`[warning] ${warning}`)
  process.exit(0)
})()
