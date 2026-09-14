import { z } from 'zod'

// A creator's genre is an open label, not the finite catalog of tuned production defaults.
// Preserve its spelling and language; trim only accidental surrounding whitespace.
export const GenreCategorySchema = z.string().trim().min(1).max(120)
