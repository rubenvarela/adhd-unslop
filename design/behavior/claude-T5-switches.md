## turn 1
Both ADHD mode and unslop mode are active.

`ls -li` runs `ls -l` (long format) with `-i` (inode numbers). Each line shows: inode number, permissions, link count, owner, group, size, modification time, filename. Example: `1234567 -rw-r--r-- 1 user staff 42 Sep 12 10:00 file.txt`.

Try it: run `ls -li` in any directory to see the inode numbers.

## turn 2: stop adhd mode
ADHD mode off. Unslop mode still active.

## turn 3
Unslop mode is active. ADHD mode is off.

A symlink stores a path to its target, not the target itself. If the path is relative, it resolves relative to the symlink's own location, so moving the symlink to a different directory changes what that relative path points to and can break it. If you move or rename the target instead, any symlink pointing to it (relative or absolute) breaks because the stored path no longer matches where the target now lives.

## turn 4: stop unslop
Both ADHD mode and unslop mode are off now.

## turn 5
Both are off — ADHD mode and unslop mode.

## turn 6: re-invoke
Both ADHD mode and unslop mode are active now.

## turn 7
Both ADHD mode and unslop mode are active.

