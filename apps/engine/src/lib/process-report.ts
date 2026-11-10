// Node's diagnostic report reverse-resolves every open socket with a blocking getnameinfo(),
// and the Claude Agent SDK calls process.report.getReport() on every run to choose between its
// glibc and musl binary. A single PTR nobody answers freezes the event loop for the resolver's
// full timeout: on an Incus box that is 10 s per run, with the HTTP server dead meanwhile.
// Imported first from bin.ts so it also lands before libsql pulls in detect-libc, which calls
// getReport() the same way. `excludeNetwork` is Node 22; @types/node 20 does not know it yet.
if (process.report) (process.report as { excludeNetwork?: boolean }).excludeNetwork = true

export {}
