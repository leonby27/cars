# Service hero video, September 2026

The page initially renders a responsive WebP poster in a normal 100svh hero.
After that image decodes, it fetches the appropriate MP4 into a blob. Only a
complete download plus `loadeddata` enables the existing pinned scroll story.
Scrolling more than 8px before readiness, a five-second timeout, failure,
reduced motion or data saving leaves the static layout in place for that mount.
There is no late layout switch while the visitor is reading. Cleanup aborts
requests and releases the object URL. A viewport breakpoint change remounts
the preparation with the corresponding source; a scrolled page stays static.

## Assets

| Asset | Before | New |
| --- | ---: | ---: |
| Mobile film | 4,653,418 bytes | 563,057 bytes |
| Desktop film | 17,326,472 bytes | 7,409,605 bytes |
| Mobile poster | shared 1.2 MiB PNG | 19,234 bytes |
| Desktop poster | shared 1.2 MiB PNG | 35,610 bytes |

Mobile starts at the former 44% shot (3.875 seconds rounded to a source frame).
Its first 93 unused frames are omitted; the remaining 119 frames retain 24 fps
and 960×540 resolution. Scroll now maps from zero through this shorter film.
Both encodes use H.264/yuv420p, no audio, no B-frames, one keyframe per six frames
and faststart. The original film remains available as the encoding source.

Reproduce with FFmpeg (`-y` only when intentionally replacing these outputs):

```sh
ffmpeg -ss 3.875 -i public/videos/how-it-works-scroll.mp4 -an -vf scale=960:540 -c:v libx264 -preset slow -crf 20 -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart public/videos/how-it-works-mobile-v2.mp4
ffmpeg -i public/videos/how-it-works-scroll.mp4 -an -c:v libx264 -preset slow -crf 18 -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart public/videos/how-it-works-desktop-v2.mp4
ffmpeg -ss 3.875 -i public/videos/how-it-works-scroll.mp4 -vf scale=960:540 -frames:v 1 -c:v libwebp -quality 85 public/videos/how-it-works-mobile-poster.webp
ffmpeg -i public/videos/how-it-works-scroll.mp4 -frames:v 1 -c:v libwebp -quality 85 public/videos/how-it-works-desktop-poster.webp
```

## Deployment dependency

Publish only through the existing Timeweb process after the owner's request.
Install the updated `deploy/nginx-abcars-headers.conf` with the release: its
`media-src 'self' blob:` permits playing the fully downloaded local blob. With
the old policy the browser will fall back to the poster. `vercel.json` is kept
in sync because the existing CSP tests compare it; it is not a deploy target.

## Verification

`node --test tests/service-video-loading.test.mjs tests/metrika.test.mjs` covers
activation, early scroll, timeout, decode failure, cleanup and static preferences.
Build with `npm run build`. Review mobile and desktop at `/how-it-works`, including
a deliberately delayed MP4 response; the static fallback must have one viewport
of hero, visible poster/CTA and no late height expansion after scrolling.
