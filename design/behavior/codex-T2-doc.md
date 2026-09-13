# Symlinks vs hard links

A symbolic link, or symlink, stores a path to another file or directory. A hard link gives an existing file another name. Neither creates a separate copy of the file's contents.

These examples use a macOS or Linux terminal.

When you open a symlink, the operating system follows its stored path. If you move or delete the target, that path may no longer work. The symlink still exists, but it is broken until something exists at that path again.

A hard link refers to the same underlying file as the existing name. On these systems, the filesystem identifies that file with an inode, which tracks its metadata and where its contents live. Both names are equal. Neither is the "original" that the other depends on.

| Behavior | Symlink | Hard link |
| --- | --- | --- |
| What does it refer to? | It stores a target path. | It refers to the same underlying file. |
| Can it cross filesystems? | Yes. | No. Both names must be on the same filesystem. |
| Can it link to a directory? | Yes. | Ordinary users cannot create hard links to directories. |
| What if you delete the existing target name? | The symlink breaks if its target path disappears. | The other name still works. |
| Can the target be missing when you create it? | Yes. | No. The file must already exist. |

Use a symlink when you want a path that leads to another location, such as a shortcut to a project directory. Use a hard link when you need another name for the same file on the same filesystem, and you want either name to survive deletion of the other. Use a copy when you need independent contents.

Try this example in a new temporary directory. Run each block in the same terminal session.

```sh
demo_dir=$(mktemp -d)
cd "$demo_dir"
printf 'Hello\n' > original.txt
ln -s original.txt shortcut.txt
ln original.txt another-name.txt
ls -li
```

The command format is `ln -s TARGET LINK_NAME` for a symlink and `ln EXISTING_FILE NEW_NAME` for a hard link. In `ls -li`, the first number is the inode number. `original.txt` and `another-name.txt` share that number. `shortcut.txt` has its own inode, and its listing shows `shortcut.txt -> original.txt`.

Append text through the hard link:

```sh
printf 'Added through the hard link\n' >> another-name.txt
cat original.txt
cat shortcut.txt
```

Both commands print the same two lines because both reach the file you changed. Writing through the symlink also changes that file while its target path works.

Now remove the name that the symlink targets:

```sh
rm original.txt
cat another-name.txt
cat shortcut.txt
```

`another-name.txt` still prints both lines. `cat shortcut.txt` reports that the file does not exist because the symlink still points to `original.txt`. Deleting a name removes that link. The filesystem can reclaim the contents after the last hard link is gone and no process still has the file open. A symlink does not keep the contents alive.

Two details matter in everyday development. A relative symlink target resolves from the directory containing the symlink, not from your terminal's current directory. Moving that symlink can therefore change where it points. An absolute target, such as `/tmp/example.txt`, always refers to that full path.

Also, some editors save by writing a new file and replacing the old name. That replacement can make two hard-linked names refer to different files. The append command above modifies the existing file, so both hard links see the change.
