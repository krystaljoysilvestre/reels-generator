---
name: reword
description: Reword user-facing UI copy into this product's house voice — short, clear, non-technical, lightly cinematic, and never exposing AI/pipeline internals. Use when writing or revising any string a creator reads (labels, buttons, placeholders, helper text, tooltips, empty states, errors, toasts). Pass a file, component, or string as the target.
---

# Reword to the house voice

The product is a tool for **creators making short video reels**. They are storytellers, not engineers. Copy should read like a calm, capable production assistant — never like a machine explaining itself.

## The five rules

1. **Non-technical.** The user never needs to know there's an LLM, image model, diffusion, prompts, seeds, or a pipeline. Describe the *outcome*, not the mechanism.
2. **Short.** Cut every word that isn't carrying meaning. Prefer one clause over two. A placeholder is a nudge, not a manual.
3. **Clear.** Plain, concrete language a first-time user gets at a glance. If a film term is less clear than a plain word, use the plain word.
4. **Lightly cinematic.** Where it fits naturally, reach for production vocabulary — it makes the tool feel like a film set, not a settings panel. Flavor, not jargon. Never sacrifice rule 3 for it.
5. **True.** Never imply behavior the product doesn't actually perform; if a line isn't literally true today, replace it with one that is. A loading line, tooltip, or reassurance is a claim — creators screenshot claims ("Studying what works on your channel…" on a channel with no performance data is a lie waiting to be caught). When rewording, verify the claim against the code before keeping it.

## Never expose internals — banned words

Don't ship these to the user. Replace with the outcome.

| Don't say | Say instead |
|---|---|
| regenerate / re-roll | **reshoot**, new take, try again |
| prompt / image prompt | (drop it — describe the change itself) |
| generate / generating | **create**, make / **working…**, reshooting… |
| AI / model / LLM | (don't name it; speak as the tool) |
| seed, guidance, steps, img2img, diffusion | (never surface — internal only) |
| render (as a verb to the user) | usually fine for the final video; avoid for stills |
| tokens, API, payload, schema, endpoint | (never surface) |

## Cinematic vocabulary (use where natural)

shot, take, reshoot, scene, frame, look, lighting, angle (wide / close / overhead), setting, mood, cut, footage, on-screen. A verb like **"Reshoot"** beats "Regenerate"; **"a fresh take"** beats "re-roll"; **"the look you want"** beats "the image prompt."

## How to reword

1. **Find the user-facing strings** in the target — button labels, placeholders, helper/empty/error text, tooltips, aria-labels, toasts. Leave code comments and dev-facing logs alone (technical is fine there).
2. For each, ask: *does this name a mechanism the user doesn't need?* If so, rewrite to the outcome.
3. Tighten to the fewest clear words. Front-load the action or benefit.
4. Add cinematic flavor only where it reads naturally and stays clear.
5. **Keep meaning and fit.** Don't change what the control does; don't overflow tight UI (buttons stay ~1–2 words). Keep `aria-label`s meaningful for screen readers.
6. Show a small **before → after** table for review before/after applying.

## Examples

- "Regenerate image" → **"Reshoot this scene"**
- "Leave blank to just re-roll, or describe a change — it's rewritten into a proper image prompt for you." → **"Leave empty for a fresh take, or describe the look you want."**
- "Generation failed — try again." → **"That take didn't come through — try again."**
- "Approve story to start image generation" → **"Approve the script to start the shoot."**

When unsure between two good options, prefer the **shorter, plainer** one and note the alternative.
