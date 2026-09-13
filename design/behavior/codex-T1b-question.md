A **symlink points to a file's path. A hard link is another name for the same file.**

| Behavior on macOS | Symlink | Hard link |
|---|---|---|
| Delete the original name | Link breaks | Other name still works |
| Rename or move the original | Usually breaks | Still works within the same filesystem |
| Link to a folder | Yes | No, for ordinary use |
| Link across volumes | Yes | No |

Both let you access the original contents without making a separate copy. With hard links, neither name is the "main" one. The file remains until you delete its last hard link.

In Terminal, with an existing `original.txt`:

```sh
ln -s original.txt shortcut.txt  # Create a symlink
ln original.txt another-name.txt  # Create a hard link
```

Changes to the file's contents show through either name. Some editors save by replacing the file, which can cause hard-linked names to stop sharing changes.

For a shortcut to a file or folder, use a symlink. Finder's **Make Alias** creates a different kind of shortcut that can often follow a moved target.