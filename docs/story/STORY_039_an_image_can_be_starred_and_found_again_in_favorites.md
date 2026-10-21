# STORY_039 — An image can be starred and found again in Favorites

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-21)
**Status:** Drafted 2026-10-21 for the owner's approval; not to be built until he approves
**Created:** 2026-10-21
**Relates to:** [STORY_038](STORY_038_a_clicked_image_opens_in_a_viewer_over_the_page.md) (the viewer's header carries the star; that story ships first), [STORY_007](STORY_007_past_generations_are_kept_and_can_be_reopened.md) (history on disk)

As the owner, I want to star an image I like and find all my starred images in one place, so
that the good ones do not get lost among every generation.

## Current state

Read on 2026-10-21:

- A finished result's action row (`app/components/generation/GenerationView.tsx`) holds Info,
  Regenerate and Delete on desktop (the owner's screenshot), with Edit and Download on the image's
  hover; on narrow screens Edit, Download and the rest sit in the same row with the `appicon` set.
- History is one JSON file (`app/lib/history-store.ts`, rules in `app/lib/history.ts`); a
  `HistoryEntry` has no favourite field. `app/app/api/history/[id]/route.ts` answers DELETE only.
- My Library (`app/components/library/Library.tsx`) is one masonry grid of finished images,
  each card a link to its turn with a hover Download; there are no segments.
- The harvested sprite (`app/public/reference/sprite.svg`) already holds `qwpcicon-star`,
  `qwpcicon-star-fill`, `appicon-star` and `appicon-star-fill`. The 2026-09-26 recon records no
  favourites surface on chat.qwen.ai: its inventory and interactions name none.

## UI Mockup

**The reference capture:** none; chat.qwen.ai's favourites were not captured, if they exist.
The icons are the reference's own, from the sprite above. Sketches:

The action row under a result, desktop, unstarred and starred:

```
  ⓘ   ↻   🗑   ☆          ⓘ   ↻   🗑   ★  (filled, the accent colour)
                ↑ Star                  ↑ Unstar
```

My Library with its segments (Favorites selected), a starred card's corner:

```
My Library                                   ( All | Favorites )

┌────────┐ ┌────────┐ ┌────────┐
│      ★ │ │      ★ │ │      ★ │   ★ always shown on a starred card;
│  img   │ │  img   │ │  img   │   ☆ on hover beside Download on the rest
└────────┘ └────────┘ └────────┘

Favorites with nothing starred:

            No favorites yet.
   Star an image to keep it here.
```

The viewer's header (STORY_038): `name                ☆  ⤓  ✕`.

Narrow: the star joins the footer row in the `appicon` set, 44 px touch area; the library
segments are full width.

## Departures from the reference

- Favourites are ours (the owner, 2026-10-21); nothing in the capture shows them. The star
  icons are lifted from the reference's sprite, so they look like theirs.

## Acceptance Criteria

- [ ] A finished result shows a Star button in its action row, after Delete, in both icon sets.
      Pressing it stars the image: the icon fills in the accent colour and the button's name
      becomes Unstar. Pressing again unstars it. A running, failed, moderated or cancelled turn
      shows no star.
- [ ] A star is saved in history: `PATCH /api/history/{id}` with `{"favorite": true}` or
      `false` sets it, writes the file atomically as every change does, and answers the entry;
      404 for an unknown id, 409 for an entry that is not finished. A reload, a reopen of the
      chat and a restart of the app all show it starred. Entries saved before this story read
      as unstarred.
- [ ] My Library has two segments, All and Favorites, All selected first, the choice kept in the
      URL (`/library?view=favorites`). Favorites lists only starred images, newest star first;
      with none it says "No favorites yet. Star an image to keep it here." A starred card shows a
      filled star in its corner at all times; any card shows Star or Unstar on hover beside
      Download, and pressing it does not open the turn.
- [ ] The viewer (STORY_038) shows the same star in its header, and starring there updates the
      action row and My Library without a reload.
- [ ] Deleting an image, or its chat, removes its star with it; Favorites never lists a deleted
      image.
- [ ] Narrow (iPhone 13 descriptor, touch): the star is in the footer row with a 44 px touch
      area, and the library's segments fill the width.

## Technical Notes

- `HistoryEntry` gains `favoritedAt?: string`, the ISO time it was starred, absent when not;
  `parseEntries` accepts its absence, so the file needs no migration. Favorites sort by it.
- One rule in `history.ts`, `setFavorite(entries, id, on, at)`, with its outcomes (set,
  unknown, not finished); the route and the store call it, as `renameChat` does.
- The star's state lives in history, the single source; the action row, the viewer and the
  library read it from what they already load and update it from the PATCH answer.

## Testing Plan

Static: `pnpm lint` and `pnpm typecheck`, as the gate runs them.

Unit:
- `app/lib/history.test.ts` (extended): `setFavorite` stars and unstars a finished entry and
  stamps `favoritedAt`; refuses an unknown id and an unfinished entry; `parseEntries` reads an
  entry with no `favoritedAt` as unstarred; `removeEntry` and `removeChat` drop starred entries
  like any other.
- `app/lib/history-view.test.ts` (extended): the Favorites view lists only starred finished
  entries, newest star first, and is empty with the empty-state text when none are starred.

Integration (`app/app/api/history/[id]/route.test.ts`, extended, against a temp history file):
PATCH with `true` then `false` answers the entry and the file holds and then drops
`favoritedAt`; 404 for an unknown id; 409 for a running entry; a body without a boolean
`favorite` is a 400.

E2E (`app/e2e/favorites.spec.ts`, new; the stub's `done-after-1-poll` script):
1. Generate an image; press Star in its action row: the button reads Unstar and its icon is the
   filled star.
2. Reload: still starred. Open My Library, choose Favorites: the URL ends `view=favorites`, one
   card, with the corner star.
3. In All, hover a second (unstarred) generation's card and press its Star: it appears in
   Favorites; the turn did not open.
4. Open the first image in the viewer (STORY_038) and press Unstar in its header: Favorites now
   holds only the second, without a reload.
5. Delete the second image's chat: Favorites shows "No favorites yet."
6. Narrow (`devices["iPhone 13"]`): the footer row's Star has a box of at least 44 px.

Regression cover that must stay green: `history.spec.ts` (reopen, delete), `chat.spec.ts`
(My Library, deletes), `generate.spec.ts` (the action row), and STORY_038's `viewer.spec.ts`.

## Estimated Complexity

Medium: one history field and rule, one route verb, the action row, the library segments and
the viewer's header.
