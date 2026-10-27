// The seat columns on a test's upstream `Database`: the real ones, through the Tracy store that
// `Database.init()` attaches (hook H10, `src/tracy/persistence.ts`). The tests keep calling
// upstream's own methods (`getUserById`, `getPermissions`, …) on the same object.
import type { Database } from '../../src/db.js';
import { seatColumnsOf, type SeatColumns } from '../../src/tracy/seat-book.js';

export type { SeatColumns };

export function withSeatColumns(db: Database): Database & SeatColumns {
  return Object.assign(db, seatColumnsOf(db));
}
