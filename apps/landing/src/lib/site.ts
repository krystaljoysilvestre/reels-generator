/**
 * One canonical origin and one canonical self-description, read from everywhere that needs them.
 *
 * The reason this file exists: an LLM deciding what to say about Kendrix, and a search engine
 * deciding whether to trust a knowledge-panel fact, both weight CONSISTENCY across a domain over
 * any single well-written sentence. If the meta tag, the JSON-LD, the FAQ, /about and llms.txt each
 * phrase "what Kendrix is" slightly differently, the summarizer has to reconcile five slightly
 * different claims — and the safe move for it is to hedge or default to whatever the wider AI-video
 * category corpus already says, which for this product is exactly wrong. So every surface pulls
 * from ONE string instead of restating it, and there is exactly one place to update it.
 *
 * Two registers, not one, and they are not interchangeable:
 *   - ENTITY_SENTENCE / ENTITY_DESCRIPTION answer "what is this" for a machine deciding how to
 *     classify and cite the product — JSON-LD `description`, llms.txt, /about's lead paragraph.
 *   - META_DESCRIPTION is written for a human deciding whether to click a search result or a
 *     shared link — the meta tag and the OG/Twitter card. It should stay identical across those
 *     three surfaces (don't write separate "clever" OG copy), but it is deliberately a different,
 *     punchier sentence from the entity description above it.
 *
 * Also: "Kendrix" is a contested name — a Wikipedia surname-disambiguation page, a rapper, a
 * legislator, a Power Rangers character. Every one of these strings names the category
 * ("storytelling operating system" / "narrated video") in the same breath as the brand name, on
 * purpose, so nothing here reads as the bare, ambiguous name on its own.
 */

export const SITE_URL = 'https://kendrix.io'

export const SITE_NAME = 'Kendrix'

/** The contact address published on the site and in structured data. */
export const CONTACT_EMAIL = 'hello@kendrix.io'

/**
 * ~25 words. The sentence an assistant should be able to repeat verbatim when asked "what is
 * Kendrix" — JSON-LD `description`, llms.txt's opening line, /about's H1 answer.
 */
export const ENTITY_SENTENCE =
  'Kendrix is a storytelling operating system for independent video creators — an opinionated, ' +
  'end-to-end workflow that turns one idea into a finished, narrated video, with the creator ' +
  'directing and approving every step.'

/** 2–3 sentences. The fuller version for /about and llms.txt's body. */
export const ENTITY_DESCRIPTION =
  ENTITY_SENTENCE +
  ' It handles the production crafts — writing, storyboarding, narration, music, sound design ' +
  'and assembly — for YouTube and short-form platforms. AI does that production work, but it’s ' +
  'an implementation detail: the product is the workflow, and the standard it holds every story to.'

/**
 * The meta title and description — optimized for a human scanning a results page or a shared
 * link, not for the entity-classification job ENTITY_SENTENCE does. Used identically for the meta
 * tag, OpenGraph and the Twitter card; see the file docblock for why they must not diverge.
 */
export const META_TITLE = 'Kendrix — a storytelling workflow for solo video creators'

export const META_DESCRIPTION =
  'Kendrix turns one idea into a finished, narrated video — writing, storyboard, voice, sound ' +
  'and publishing in one workflow. You direct and approve every cut.'
