// Read from the browser as well as from the route, so it cannot live next to the server-only
// storage helpers: a quarter of MAX_UPLOAD_FILE_BYTES, because a Box takes its files as a stream
// where the hub buffers the whole object to hand it to Supabase, which caps one at 50 MB anyway.
export const FOREMAN_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
