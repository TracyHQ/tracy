// H10: the seat door's book over upstream's `Database` — upstream's own rows (accounts,
// permissions, credential version) plus the seat columns Tracy adds (`persistence.ts`).
import type { Database } from '../db.js';
import { tracyStoreOf, type TracyStore } from './persistence.js';
import type { SeatBook } from './seat.js';

/** The seat columns as `seat.ts` and the tests call them (four set/get pairs' worth: role, email, seat role). */
export interface SeatColumns {
  setUserRole(id: number, role: 'admin' | 'user'): void;
  setUserEmail(id: number, email: string | null): void;
  getUserEmail(id: number): string | null;
  getSeatRole(userId: number): string | null;
  setSeatRole(userId: number, seatRole: string): void;
}

/** The store `init()` attached, or a refusal: a seat must never be written without its columns. */
function storeOf(db: Database): TracyStore {
  const store = tracyStoreOf(db);
  if (store === undefined) throw new Error('Tracy seat columns are missing: Database.init() has not run');
  return store;
}

/** The seat columns of one database, backed by its Tracy store. */
export function seatColumnsOf(db: Database): SeatColumns {
  const store = storeOf(db);
  return {
    setUserRole: (id, role) => store.setUserRole(id, role),
    // A visitor has no address; null keeps whatever is stored (the door never erases a proven one).
    setUserEmail: (id, email) => {
      if (email !== null) store.setEmail(id, email);
    },
    getUserEmail: (id) => store.emailOf(id),
    getSeatRole: (userId) => store.seatRole(userId),
    setSeatRole: (userId, seatRole) => store.setSeatRole(userId, seatRole),
  };
}

/** Upstream's account rows plus the seat columns: what `upsertSeatUser`/`revokeSeat` write. */
export function seatBookOf(db: Database): SeatBook {
  const columns = seatColumnsOf(db);
  return {
    getUserByUsername: (username) => db.getUserByUsername(username),
    createUser: (username, passwordHash, role) => db.createUser(username, passwordHash, role),
    listUsers: () => db.listUsers(),
    deleteUser: (id) => db.deleteUser(id),
    updatePasswordHash: (id, passwordHash) => db.updatePasswordHash(id, passwordHash),
    setPermissions: (userId, perms) => db.setPermissions(userId, perms),
    setUserRole: columns.setUserRole,
    setUserEmail: columns.setUserEmail,
    getSeatRole: columns.getSeatRole,
    setSeatRole: columns.setSeatRole,
  };
}
