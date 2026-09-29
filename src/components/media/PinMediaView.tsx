import { useEffect, useState } from 'react';

import { pinMedia, type PinMediaUrls } from '@/features/media/api';

import { BoomerangPlayer } from './BoomerangPlayer';
import { VideoPlayer } from './VideoPlayer';

/** A post's video or burst (boomerang, slo-mo, rewind, loop), if it has one. */
export function PinMediaView({ pinId }: { pinId: number }) {
  const [media, setMedia] = useState<PinMediaUrls | null>(null);
  useEffect(() => {
    let alive = true;
    pinMedia(pinId).then((m) => alive && setMedia(m));
    return () => {
      alive = false;
    };
  }, [pinId]);
  if (!media) return null;
  if (media.kind === 'video' && media.videoUrl) return <VideoPlayer uri={media.videoUrl} rounded={false} effect={media.effect} />;
  if (media.kind === 'boomerang' && media.frameUrls.length >= 3) return <BoomerangPlayer frames={media.frameUrls} motion={media.motion} effect={media.effect} rounded={false} />;
  return null;
}
