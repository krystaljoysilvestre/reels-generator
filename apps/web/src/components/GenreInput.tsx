'use client'

import { useId } from 'react'
import { GENRE_OPTIONS, genreFromInput, genreLabel } from '@/lib/genre-labels'

/** Known suggestions without restricting the creator to a finite genre catalog. */
export function GenreInput({ value, onChange }: { value: string; onChange: (genre: string) => void }) {
  const listId = useId()
  return (
    <>
      <input
        className="input w-full"
        list={listId}
        value={genreLabel(value)}
        onChange={(event) => onChange(genreFromInput(event.target.value))}
        maxLength={120}
        placeholder="Choose or describe a genre"
        aria-label="Kind of story"
      />
      <datalist id={listId}>
        {GENRE_OPTIONS.map((genre) => <option key={genre.value} value={genre.label} />)}
      </datalist>
    </>
  )
}
