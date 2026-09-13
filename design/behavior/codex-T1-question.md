I couldn’t find the `adhd-unslop` skill locally.

A **symlink points to a path**. A **hard link is another name for the same file**.

| On macOS | Symlink | Hard link |
|---|---|---|
| Create one | `ln -s original link` | `ln original link` |
| Link to a folder? | Yes | No, for normal use |
| Cross disks or volumes? | Yes | No |
| Move or delete the original? | Link breaks if its target path disappears | Other name still works |
| Edit through the link? | Changes the target file | Changes the same shared file |

With a hard link, neither name is the “real” one. Deleting one name leaves the file accessible through the other; its storage is freed after the last hard link is removed and no process holds it open.

**Usually, use a symlink** when you want a file or folder accessible from another location.

Finder’s **Make Alias** creates a third kind of reference—a macOS alias, which can often follow a moved target.