import Ionicons from '@expo/vector-icons/Ionicons';
import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText, Avatar, Button } from '@/components/ui';
import type { RoomPass } from '@/features/events/room';
import { useTheme } from '@/theme';

type Chat = { id: string; from: string; text: string };
type Reaction = { id: string; from: string; kind: 'heart' | 'flame' | 'hand' };
const REACTIONS: { kind: Reaction['kind']; icon: 'heart' | 'flame' | 'hand-left'; label: string }[] = [
  { kind: 'heart', icon: 'heart', label: 'Love it' },
  { kind: 'flame', icon: 'flame', label: 'Fire' },
  { kind: 'hand', icon: 'hand-left', label: 'Raise hand' },
];

/**
 * A virtual event's room, in the browser (LiveKit):
 *   voice : everyone talks; circles light up when someone speaks
 *   video : a grid of cameras
 *   stream: the host's camera big, everyone else watches
 * Everyone can chat and send reactions. Nothing is recorded.
 */
export function RoomView({ pass, onLeave }: { pass: RoomPass; onLeave: () => void }) {
  const t = useTheme();
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [, setTick] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [needsSound, setNeedsSound] = useState(false);
  const [chat, setChat] = useState<Chat[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [draft, setDraft] = useState('');
  const [showChat, setShowChat] = useState(pass.kind === 'stream');
  const audioBox = useRef<HTMLDivElement | null>(null);
  const canPublish = pass.kind !== 'stream' || pass.role === 'host';
  const rerender = () => setTick((n) => n + 1);

  useEffect(() => {
    const dec = new TextDecoder();
    const onData = (payload: Uint8Array, p?: Participant) => {
      try {
        const msg = JSON.parse(dec.decode(payload));
        const from = p?.name || 'Someone';
        if (msg.type === 'chat' && typeof msg.text === 'string') setChat((c) => [...c.slice(-99), { id: `${Date.now()}${Math.random()}`, from, text: msg.text.slice(0, 300) }]);
        if (msg.type === 'react' && REACTIONS.some((r) => r.kind === msg.kind)) addReaction({ id: `${Date.now()}${Math.random()}`, from, kind: msg.kind });
      } catch {
        // ignore anything that isn't ours
      }
    };
    const onTrack = (track: Track) => {
      if (track.kind === Track.Kind.Audio && audioBox.current) audioBox.current.appendChild(track.attach());
      rerender();
    };
    const onUntrack = (track: Track) => {
      track.detach().forEach((el) => el.remove());
      rerender();
    };
    room
      .on(RoomEvent.ParticipantConnected, rerender)
      .on(RoomEvent.ParticipantDisconnected, rerender)
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.TrackUnsubscribed, onUntrack)
      .on(RoomEvent.TrackMuted, rerender)
      .on(RoomEvent.TrackUnmuted, rerender)
      .on(RoomEvent.LocalTrackPublished, rerender)
      .on(RoomEvent.LocalTrackUnpublished, rerender)
      .on(RoomEvent.ActiveSpeakersChanged, rerender)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsSound(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, rerender);

    let cancelled = false;
    (async () => {
      try {
        await room.connect(pass.url, pass.token);
        if (cancelled) return;
        setStatus('connected');
        setNeedsSound(!room.canPlaybackAudio);
        if (canPublish) {
          await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
          if (pass.kind !== 'voice') await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
        }
        rerender();
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      room.removeAllListeners();
      room.disconnect();
    };
    // The room is made once per pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function addReaction(r: Reaction) {
    setReactions((list) => [...list.slice(-11), r]);
    setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), 3500);
  }

  const send = async (msg: object) => room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true });

  async function sendChat() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setChat((c) => [...c.slice(-99), { id: `${Date.now()}`, from: 'You', text }]);
    await send({ type: 'chat', text }).catch(() => undefined);
  }

  async function react(kind: Reaction['kind']) {
    addReaction({ id: `${Date.now()}`, from: 'You', kind });
    await send({ type: 'react', kind }).catch(() => undefined);
  }

  const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  const onCamera = people.filter((p) => p.isCameraEnabled);
  const hosts = pass.kind === 'stream' ? onCamera : [];
  const mic = room.localParticipant.isMicrophoneEnabled;
  const cam = room.localParticipant.isCameraEnabled;

  if (status === 'failed') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.space[5], gap: t.space[3], backgroundColor: '#000' }}>
        <AppText style={{ color: '#FFF' }} align="center">
          Couldn&apos;t connect to the room. Check your connection and try again.
        </AppText>
        <Button label="Leave" variant="secondary" onPress={onLeave} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0B0C' }}>
      <div ref={audioBox} style={{ display: 'none' }} />
      <View style={{ paddingHorizontal: t.space[4], paddingVertical: t.space[3], flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" style={{ color: '#FFF' }} numberOfLines={1}>
            {pass.title}
          </AppText>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {status === 'connecting' ? 'Connecting…' : `${people.length} here · ${pass.kind === 'voice' ? 'Voice chat' : pass.kind === 'video' ? 'Video call' : 'Livestream'}`}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={showChat ? 'Hide chat' : 'Show chat'} onPress={() => setShowChat((v) => !v)} hitSlop={8}>
          <Ionicons name={showChat ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color="#FFF" />
        </Pressable>
      </View>

      {needsSound ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => room.startAudio().then(() => setNeedsSound(false))}
          style={{ marginHorizontal: t.space[4], marginBottom: t.space[2], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.primary }}>
          <AppText weight="bold" align="center" style={{ color: t.colors.onPrimary }}>
            Tap to turn on sound
          </AppText>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: t.space[3], gap: t.space[3] }}>
          {pass.kind === 'stream' ? (
            hosts.length ? (
              hosts.map((p) => <VideoTile key={p.identity} p={p} big />)
            ) : (
              <AppText align="center" style={{ color: 'rgba(255,255,255,0.7)', paddingVertical: 80 }}>
                Waiting for the host to go live…
              </AppText>
            )
          ) : null}
          {pass.kind === 'video' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {people.map((p) => (
                <View key={p.identity} style={{ width: people.length === 1 ? '100%' : '48.5%' }}>
                  {p.isCameraEnabled ? <VideoTile p={p} /> : <VoiceTile p={p} square />}
                </View>
              ))}
            </View>
          ) : null}
          {pass.kind === 'voice' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[4], justifyContent: 'center', paddingTop: t.space[4] }}>
              {people.map((p) => (
                <VoiceTile key={p.identity} p={p} />
              ))}
            </View>
          ) : null}
          {pass.kind === 'stream' ? (
            <AppText variant="caption" align="center" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {people.length - hosts.length} watching
            </AppText>
          ) : null}
        </ScrollView>

        <View pointerEvents="none" style={{ position: 'absolute', right: 12, bottom: 12, gap: 6, alignItems: 'flex-end' }}>
          {reactions.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <Ionicons name={REACTIONS.find((x) => x.kind === r.kind)!.icon} size={18} color={r.kind === 'hand' ? '#FFD60A' : t.colors.primary} />
              <AppText variant="caption" style={{ color: '#FFF' }}>
                {r.from}
                {r.kind === 'hand' ? ' raised a hand' : ''}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      {showChat ? (
        <View style={{ maxHeight: 220, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
          <ScrollView contentContainerStyle={{ padding: t.space[3], gap: 4 }}>
            {chat.length ? (
              chat.map((m) => (
                <AppText key={m.id} variant="small" style={{ color: '#FFF' }}>
                  <AppText variant="small" weight="bold" style={{ color: '#FFD60A' }}>
                    {m.from}
                  </AppText>{' '}
                  {m.text}
                </AppText>
              ))
            ) : (
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Say hi. Chat isn&apos;t saved.
              </AppText>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: t.space[2], paddingHorizontal: t.space[3], paddingBottom: t.space[2] }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendChat}
              placeholder="Message everyone"
              placeholderTextColor="rgba(255,255,255,0.5)"
              maxLength={300}
              accessibilityLabel="Chat message"
              style={{ flex: 1, color: '#FFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' }}
            />
            <Button label="Send" size="md" onPress={sendChat} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: t.space[3], padding: t.space[3] }}>
        {REACTIONS.map((r) => (
          <RoundButton key={r.kind} icon={r.icon} label={r.label} onPress={() => react(r.kind)} />
        ))}
        {canPublish ? (
          <RoundButton
            icon={mic ? 'mic' : 'mic-off'}
            label={mic ? 'Mute' : 'Unmute'}
            active={!mic}
            onPress={() => room.localParticipant.setMicrophoneEnabled(!mic).then(rerender)}
          />
        ) : null}
        {canPublish && pass.kind !== 'voice' ? (
          <RoundButton
            icon={cam ? 'videocam' : 'videocam-off'}
            label={cam ? 'Turn camera off' : 'Turn camera on'}
            active={!cam}
            onPress={() => room.localParticipant.setCameraEnabled(!cam).then(rerender)}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave"
          onPress={() => {
            room.disconnect();
            onLeave();
          }}
          style={{ paddingHorizontal: 18, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D62828' }}>
          <AppText weight="bold" style={{ color: '#FFF' }}>
            Leave
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.14)' }}>
      <Ionicons name={icon} size={22} color={active ? '#0B0B0C' : '#FFFFFF'} />
    </Pressable>
  );
}

function VideoTile({ p, big }: { p: Participant; big?: boolean }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const track = p.getTrackPublication(Track.Source.Camera)?.track;
  useEffect(() => {
    const el = video.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <View style={{ aspectRatio: big ? 9 / 12 : 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1C1C1E', borderWidth: 2, borderColor: p.isSpeaking ? '#34C759' : 'transparent' }}>
      <video ref={video} autoPlay playsInline muted={p.isLocal} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: p.isLocal ? 'scaleX(-1)' : undefined }} />
      <NameTag p={p} />
    </View>
  );
}

function VoiceTile({ p, square }: { p: Participant; square?: boolean }) {
  const name = p.isLocal ? 'You' : p.name || 'Member';
  return (
    <View
      style={
        square
          ? { aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: p.isSpeaking ? '#34C759' : 'transparent' }
          : { width: 96, alignItems: 'center', gap: 6 }
      }>
      <View style={{ borderRadius: 999, borderWidth: 3, borderColor: p.isSpeaking ? '#34C759' : 'transparent', padding: 2 }}>
        <Avatar name={p.name || name} uri={null} size={square ? 64 : 72} />
      </View>
      {square ? <NameTag p={p} /> : (
        <AppText variant="caption" weight="bold" style={{ color: '#FFF' }} numberOfLines={1}>
          {name}
          {p.isMicrophoneEnabled ? '' : ' · muted'}
        </AppText>
      )}
    </View>
  );
}

function NameTag({ p }: { p: Participant }) {
  return (
    <View style={{ position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
      {!p.isMicrophoneEnabled ? <Ionicons name="mic-off" size={12} color="#FFF" /> : null}
      <AppText variant="caption" weight="bold" style={{ color: '#FFF' }}>
        {p.isLocal ? 'You' : p.name || 'Member'}
      </AppText>
    </View>
  );
}
