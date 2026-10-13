// Bounds for the "people working" count staff enter on /staff. Its own module
// so the staff page can import it without pulling the per-stand starting
// values (square/staffing.ts) into a public JS bundle.
export const MIN_STAFF = 1;
export const MAX_STAFF = 60;
