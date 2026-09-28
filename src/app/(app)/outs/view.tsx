import Ionicons from "@expo/vector-icons/Ionicons";
import * as ScreenCapture from "expo-screen-capture";
import { Image } from "expo-image";
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

import { AppText } from "@/components/ui";
import { openOut, reportScreenshot, type OpenedOut } from "@/features/outs/api";
import { refreshNewOuts } from "@/features/outs/useNewOuts";
import { timeAgo } from "@/lib/time";
import { useTheme } from "@/theme";

const SECONDS = 8;

/** Watching Outs: full screen, 8 seconds each, tap to skip. Direct Outs open once. */
export default function ViewOuts() {
  const t = useTheme();
  const router = useRouter();
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
      duration: SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && next());
    return () => anim.stop();
  }, [out, progress, next]);

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
          <Image
            source={{ uri: out.url }}
            style={{ flex: 1 }}
            contentFit="cover"
            accessible={false}
            transition={0}
          />
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
    </View>
  );
}
