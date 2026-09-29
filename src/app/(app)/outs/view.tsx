import Ionicons from "@expo/vector-icons/Ionicons";
import * as ScreenCapture from "expo-screen-capture";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MAX_OUT_VIDEO_SECONDS } from "@/components/camera/CameraCapture";
import { EffectOverlay } from "@/components/media/EffectOverlay";
import type { EffectKey } from "@/features/photos/effects";
import { AppText, useToast } from "@/components/ui";
import {
  openOut,
  pinOut,
  reportScreenshot,
  unpinOut,
  type OpenedOut,
} from "@/features/outs/api";
import { refreshNewOuts } from "@/features/outs/useNewOuts";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { useTheme } from "@/theme";

const SECONDS = 8;

/** How long until an Out disappears, in words ("Gone in 42 min"). */
function timeLeft(expiresAt: string) {
  const min = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
  if (min <= 0) return "Gone soon";
  return min >= 60 ? `Gone in ${Math.round(min / 60)} hr` : `Gone in ${min} min`;
}

/** Watching Outs: full screen, 8 seconds each, tap to skip. Pin one to keep it after its time is up. */
export default function ViewOuts() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [pinBusy, setPinBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const list = (ids ?? "").split(",").map(Number).filter(Number.isInteger);
  const [index, setIndex] = useState(0);
  // What we got back for each Out id (the photo link, or why it can't open).
  const [loaded, setLoaded] = useState<{
    id: number;
    out?: OpenedOut;
    error?: string;
  } | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const currentId = list[index];
  const out = loaded && loaded.id === currentId ? (loaded.out ?? null) : null;
  const error =
    loaded && loaded.id === currentId ? (loaded.error ?? null) : null;

  const next = useCallback(() => {
    if (index + 1 < list.length) setIndex((i) => i + 1);
    else {
      refreshNewOuts();
      router.back();
    }
  }, [index, list.length, router]);

  // Open the current Out (this is what marks it opened).
  useEffect(() => {
    if (currentId == null) return;
    let alive = true;
    progress.setValue(0);
    openOut(currentId)
      .then((o) => alive && setLoaded({ id: currentId, out: o }))
      .catch(
        (e) =>
          alive &&
          setLoaded({
            id: currentId,
            error: e instanceof Error ? e.message : "This Out is gone.",
          }),
      );
    return () => {
      alive = false;
    };
  }, [currentId, progress]);

  // Timer bar, then the next one.
  useEffect(() => {
    if (!out) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      // A video Out runs until it ends (at most 9 seconds); a photo shows for 8.
      duration: (out.kind === "video" ? MAX_OUT_VIDEO_SECONDS + 1 : SECONDS) * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && next());
    return () => anim.stop();
  }, [out, progress, next]);

  async function togglePin() {
    if (!out) return;
    setPinBusy(true);
    try {
      if (out.pinned) await unpinOut(out.id);
      else await pinOut(out.id);
      setLoaded({ id: out.id, out: { ...out, pinned: !out.pinned } });
      toast(
        out.pinned
          ? "Unpinned. It disappears when its time is up."
          : out.is_mine
            ? "Pinned. It stays in your Pinned Outs."
            : `Pinned. ${out.sender_name.split(" ")[0]} will know you kept it.`,
      );
      refreshNewOuts();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setPinBusy(false);
    }
  }

  // Tell the sender if someone takes a screenshot.
  useEffect(() => {
    if (Platform.OS === "web" || currentId == null || !out) return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      reportScreenshot(currentId).catch(() => undefined);
    });
    return () => sub.remove();
  }, [currentId, out]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Tap anywhere on the photo for the next one. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          out
            ? `Out from ${out.sender_name}${out.caption ? `: ${out.caption}` : ""}. Tap for the next one`
            : "Next"
        }
        onPress={next}
        style={{ flex: 1 }}
      >
        {out ? (
          out.kind === "video" ? (
            <OutVideo uri={out.url} onEnd={next} effect={out.effect} />
          ) : (
            <Image
              source={{ uri: out.url }}
              style={{ flex: 1 }}
              contentFit="cover"
              accessible={false}
              transition={0}
            />
          )
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: t.space[5],
            }}
          >
            {error ? (
              <AppText align="center" style={{ color: "#FFFFFF" }}>
                {error}
              </AppText>
            ) : (
              <ActivityIndicator color="#FFFFFF" />
            )}
          </View>
        )}
      </Pressable>

      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 12,
          right: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 4 }}>
          {list.map((id, i) => (
            <View
              key={id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.35)",
                overflow: "hidden",
              }}
            >
              {i < index ? (
                <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
              ) : i === index ? (
                <Animated.View
                  style={{
                    height: 3,
                    backgroundColor: "#FFFFFF",
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <AppText weight="bold" style={{ color: "#FFFFFF" }}>
            {out
              ? `${out.sender_name}${out.event_title ? ` at ${out.event_title}` : ""} · ${timeAgo(out.created_at)}`
              : ""}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {out?.caption ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "60%",
            backgroundColor: "rgba(0,0,0,0.5)",
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[2],
          }}
        >
          <AppText align="center" style={{ color: "#FFFFFF", fontSize: 18 }}>
            {out.caption}
          </AppText>
        </View>
      ) : null}

      {out ? (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <AppText variant="small" style={{ color: "#FFFFFF" }}>
            {out.pinned ? "Pinned: it stays" : timeLeft(out.expires_at)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              out.pinned
                ? "Unpin this Out"
                : out.is_mine
                  ? "Pin this Out to keep it"
                  : `Pin this Out to keep it. ${out.sender_name} will be told`
            }
            accessibilityState={{ busy: pinBusy }}
            disabled={pinBusy}
            onPress={togglePin}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: out.pinned ? "#FFFFFF" : "rgba(0,0,0,0.55)",
              borderWidth: 1,
              borderColor: "#FFFFFF",
            }}
          >
            <Ionicons
              name={out.pinned ? "bookmark" : "bookmark-outline"}
              size={18}
              color={out.pinned ? "#000000" : "#FFFFFF"}
            />
            <AppText
              weight="bold"
              style={{ color: out.pinned ? "#000000" : "#FFFFFF" }}
            >
              {out.pinned ? "Pinned" : "Pin"}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** A video Out: plays once with sound, then moves on. */
function OutVideo({ uri, onEnd, effect }: { uri: string; onEnd: () => void; effect?: EffectKey | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  useEventListener(player, "playToEnd", onEnd);
  // Start as soon as it's loaded (some browsers ignore an early play()).
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "readyToPlay" && !player.playing) player.play();
  });
  return (
    <View style={{ flex: 1 }}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="cover"
        nativeControls={false}
        accessible={false}
      />
      <EffectOverlay effect={effect} />
    </View>
  );
}
