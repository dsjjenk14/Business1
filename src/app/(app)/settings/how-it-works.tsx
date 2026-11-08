import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Card, GlyphTitle, Screen, type GlyphName } from '@/components/ui';
import { useTheme } from '@/theme';

const TERMS: { glyph: GlyphName; term: string; body: string }[] = [
  { glyph: 'check', term: 'I’m In', body: 'Tap it on a plan, event or pin to say you’re coming or you’re into it.' },
  { glyph: 'people', term: 'Insiders', body: 'People you know in real life. You add each other by scanning codes when you’re together, or with a code one of you sends.' },
  { glyph: 'globe', term: 'Network', body: 'Your Insiders’ Insiders. You don’t know them yet, but someone you trust does.' },
  { glyph: 'medal', term: 'Vouch', body: 'Saying you’d recommend someone after spending time with them. You can vouch after you both check in together, or if their number is in your contacts. Vouch counts always show on profiles.' },
  { glyph: 'shield', term: '2 vouches', body: 'To see people out who aren’t your Insiders, you need 2 vouches. Your Insiders always see you, and you always see them.' },
  { glyph: 'link', term: 'Intros', body: 'An Insider introduces two people they know. Once both say yes, you can message each other.' },
  { glyph: 'smile', term: 'Locked In', body: 'On profiles, the Insiders someone goes out with most. It fills in on its own and never shows places. Only their Insiders see it.' },
  { glyph: 'moon', term: 'Ghost mode', body: 'One switch in Privacy and safety that hides that you’re out, and where, from everyone until you turn it off.' },
];

/** Plain-language guide to the words I'm In uses for trust. */
export default function HowItWorks() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="How I’m In works" />
      <Screen>
        <AppText tone="muted">I’m In is built on real-life trust. Here’s what the words mean.</AppText>
        {TERMS.map((x) => (
          <Card key={x.term}>
            <View style={{ gap: t.space[1] }}>
              <GlyphTitle glyph={x.glyph}>{x.term}</GlyphTitle>
              <AppText variant="small" tone="muted">
                {x.body}
              </AppText>
            </View>
          </Card>
        ))}
      </Screen>
    </View>
  );
}
