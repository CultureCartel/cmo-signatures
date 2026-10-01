#!/bin/bash
# enc.sh <framedir> <out.gif> : collapse identical consecutive frames into one frame with a longer delay
dir=$1; out=$2; list=$(mktemp); prev=""; cnt=0; file=""
emit(){ [ -n "$file" ] && printf "file '%s'\nduration %.4f\n" "$file" "$(echo "$cnt/30" | bc -l)" >> $list; }
for f in $(ls $dir/*.png | sort); do h=$(md5sum < $f | cut -c1-32); if [ "$h" == "$prev" ]; then cnt=$((cnt+1)); else emit; file=$(realpath $f); cnt=1; prev=$h; fi; done
emit; printf "file '%s'\n" "$file" >> $list
ffmpeg -v error -y -f concat -safe 0 -i $list -vf "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -fps_mode vfr -loop 0 $out
rm $list
