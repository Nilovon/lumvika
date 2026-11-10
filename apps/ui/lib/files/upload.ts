// Helpers for collecting files to upload while preserving their folder
// structure. `subDir` is the folder of the file relative to the upload root
// (the current path in the file panel); '' for a plain file at the root.

export type UploadEntry = { file: File; subDir: string }

// From an <input type="file"> (with or without `webkitdirectory`). When the
// input has `webkitdirectory`, each File carries a `webkitRelativePath` like
// "folder/sub/file.txt" — we keep everything but the filename as the subDir.
export function entriesFromFileList(files: FileList | File[]): UploadEntry[] {
    return Array.from(files).map(file => ({
        file,
        subDir: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(0, -1).join('/') : '',
    }))
}

// From a drag & drop DataTransfer, preserving nested folder structure via the
// webkitGetAsEntry API. Falls back to a flat list of dt.files when the entries
// API is unavailable.
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<UploadEntry[]> {
    const roots = Array.from(dt.items)
        .filter(item => item.kind === 'file')
        .map(item => item.webkitGetAsEntry?.() ?? null)
        .filter((entry): entry is FileSystemEntry => entry != null)

    if (!roots.length) {
        return Array.from(dt.files).map(file => ({ file, subDir: '' }))
    }

    const out: UploadEntry[] = []
    for (const entry of roots) await walkEntry(entry, '', out)
    return out
}

function walkEntry(entry: FileSystemEntry, parentDir: string, out: UploadEntry[]): Promise<void> {
    if (entry.isFile) {
        return new Promise(resolve => {
            ;(entry as FileSystemFileEntry).file(
                file => {
                    out.push({ file, subDir: parentDir })
                    resolve()
                },
                () => resolve()
            )
        })
    }

    const dirEntry = entry as FileSystemDirectoryEntry
    const childDir = parentDir ? `${parentDir}/${entry.name}` : entry.name
    const reader = dirEntry.createReader()

    return new Promise(resolve => {
        const children: FileSystemEntry[] = []
        // readEntries returns at most ~100 entries per call, so keep reading
        // until it yields an empty batch, then recurse into the children.
        const readBatch = () => {
            reader.readEntries(
                async batch => {
                    if (!batch.length) {
                        for (const child of children) await walkEntry(child, childDir, out)
                        resolve()
                        return
                    }
                    children.push(...batch)
                    readBatch()
                },
                () => resolve()
            )
        }
        readBatch()
    })
}
