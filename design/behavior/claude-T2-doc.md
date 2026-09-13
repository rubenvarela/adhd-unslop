# Symlinks vs hard links

Both are ways for one filename to point to file data without copying it. They differ in what they point to and what happens when the original is moved, deleted, or edited.

## Hard links

A hard link is a second name for the same data on disk. When you create a file, the filesystem stores the data in a block and links a name to it through an inode (the record that holds the file's metadata and the location of its data). A hard link adds another name pointing to that same inode.

```
ln original.txt hardlink.txt
```

There is no "original" after this. Both names are equally real. Editing either file changes the same data, because they are the same file under two names. Deleting one name does not remove the data. The filesystem keeps a count of how many names point to an inode, and only frees the data when that count hits zero.

Hard links have two limits. They cannot cross filesystems or partitions, because an inode number only makes sense within the filesystem that assigned it. Most systems also block hard links to directories, to avoid creating loops in the directory tree.

## Symlinks

A symlink (symbolic link, or soft link) is a small file that stores a path to another file. It does not share an inode with the target. It is closer to a shortcut.

```
ln -s original.txt symlink.txt
```

Opening `symlink.txt` reads the path inside it, then follows that path to `original.txt`. If you delete `original.txt`, the symlink still exists but points at nothing. This is a broken or dangling symlink, and trying to open it fails.

Symlinks can point to directories, and can cross filesystems, since they store a plain path rather than an inode number.

## Which one to use

Use a hard link when you want two names for the same data and don't want a deletion of one name to affect the other. This case is rare in application code. It shows up in tools like backup systems, where multiple snapshots hard-link unchanged files to avoid storing duplicate copies.

Use a symlink when you want a pointer that's allowed to break, or that spans directories or filesystems. Common cases: `node_modules/.bin` entries pointing at scripts inside package folders, a `current` symlink in a deploy directory pointing at the latest release folder, or `/etc/localtime` pointing at a timezone file.

## Checking what you're looking at

`ls -l` marks a symlink with a leading `l` and shows the target after an arrow:

```
lrwxr-xr-x  1 user  staff  11 Sep 12 10:00 symlink.txt -> original.txt
```

A hard link shows no arrow. To see how many names point at a file's data, check the link count, the number just before the owner in `ls -l` output:

```
-rw-r--r--  2 user  staff  0 Sep 12 10:00 hardlink.txt
```

That `2` means two names point to this inode. A file with no extra hard links shows `1`.

## One gotcha

Editing a symlink's target in place (opening `symlink.txt`, changing it, saving) edits the real file, same as opening it directly, since the symlink just forwards the open to the target's path. But replacing the file at the symlink's path (some editors save by writing a new file and renaming it over the old name) removes the symlink and replaces it with a plain file. Check for this if a symlink mysteriously stops being a symlink after an edit.
