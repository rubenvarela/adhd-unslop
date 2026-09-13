A hard link is a second directory entry pointing to the same inode (the same data on disk). A symlink is a small separate file that stores a path to another file.

**Hard links** (`ln original newname`)
- Both names are equally "real". Neither is the "original" after creation.
- Deleting one name leaves the data intact as long as one link remains.
- Can't span volumes/filesystems, and macOS won't let you hard-link a directory.
- If the source is deleted or moved, the hard link is unaffected. It still points at the same data.

**Symlinks** (`ln -s target newname`)
- A separate file whose content is just a path.
- Can point to directories, and can cross volumes or filesystems.
- Can point to something that doesn't exist yet (a dangling link).
- If the target is deleted, renamed, or moved, the symlink breaks.
- Shows up with an `l` in `ls -l`, and `readlink newname` shows where it points.

One macOS wrinkle: Finder aliases (File > Make Alias, or Cmd+Option+drag) are a third, different mechanism. They're not filesystem-level like the above two. Finder tracks the target by file ID and can re-find it even after a move, but that only works inside Finder or apps that ask Finder to resolve it. `ln` and `ln -s` don't produce these.

To see the difference yourself: `ls -li file hardlink` shows matching inode numbers for a hard link; the same command on a symlink shows different inodes and a `->` pointing at the target.
