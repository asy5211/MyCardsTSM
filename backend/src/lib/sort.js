// The "sort" choice every list in the admin site offers: newest first or oldest first.
//
//   const f = parse(z.object({ sort: sortParam(), ...page }), req.query);
//   ... ORDER BY o.created_at ${dir(f.sort)}, o.id ...
//
// Some lists have a natural order of their own (a seller's name, a product's name). Those allow a third value:
// sortParam(['name', 'newest', 'oldest']) keeps "name" as the default and adds the two time orders.
import { z } from 'zod';

export const TIME_SORTS = ['newest', 'oldest'];

/** A zod "sort" field. The first value is the default unless `fallback` says otherwise. */
export function sortParam(allowed = TIME_SORTS, fallback = allowed[0]) {
  return z.enum(allowed, { error: `Sort must be ${allowed.join(', ')}` }).default(fallback);
}

/** SQL direction for a time sort: "newest" is DESC, "oldest" is ASC. Only ever returns one of two fixed words.
 *  The tie-breaker after the time column uses the same direction, so "oldest" is always the exact reverse of "newest"
 *  (rows saved in the same instant, like the demo seed data, swap places too). */
export const dir = (sort) => (sort === 'oldest' ? 'ASC' : 'DESC');
