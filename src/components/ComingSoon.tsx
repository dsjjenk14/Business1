import { AppText, Section } from '@/components/ui';

/** Honest placeholder for screens scheduled in a later build phase. */
export function ComingSoon({ phase, title, body, colorIndex = 0 }: { phase: number; title: string; body: string; colorIndex?: number }) {
  return (
    <Section title={`Coming in Phase ${phase}`} colorIndex={colorIndex}>
      <AppText variant="h3">{title}</AppText>
      <AppText tone="muted">{body}</AppText>
    </Section>
  );
}
