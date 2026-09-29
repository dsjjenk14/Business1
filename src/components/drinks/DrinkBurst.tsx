import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppText } from '@/components/ui';
import { aDrink } from '@/features/drinks/words';

import { DrinkIcon } from './DrinkIcon';

export type DrinkArrival = { id: string; drink: string; name: string; from: string };

/** Drinks arriving on screen: the cocktail pops up big with who sent it, then floats away. */
export function DrinkBurst({ arrivals }: { arrivals: DrinkArrival[] }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '22%', alignItems: 'center' }}>
      {arrivals.slice(-3).map((a) => (
        <Pop key={a.id} a={a} />
      ))}
    </View>
  );
}

function Pop({ a }: { a: DrinkArrival }) {
  const [v] = useState(() => new Animated.Value(0));
  const done = useRef(false);
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5 }),
      Animated.delay(1800),
      Animated.timing(v, { toValue: 2, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      done.current = true;
    });
  }, [v]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${a.from} sent ${aDrink(a.name)}`}
      style={{
        position: 'absolute',
        alignItems: 'center',
        opacity: v.interpolate({ inputRange: [0, 0.3, 1.6, 2], outputRange: [0, 1, 1, 0] }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.3, 1, 0.9] }) },
          { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [40, 0, -120] }) },
        ],
      }}>
      <DrinkIcon drink={a.drink} size={128} />
      <View style={{ marginTop: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <AppText weight="bold" style={{ color: '#FFFFFF' }}>
          {a.from} sent {aDrink(a.name)}
        </AppText>
      </View>
    </Animated.View>
  );
}
