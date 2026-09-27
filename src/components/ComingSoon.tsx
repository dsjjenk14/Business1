import { AppText, Section } from '@/components/ui';

/** Honest placeholder for screens scheduled in a later build phase. */
export function ComingSoon({ phase, title, body }: { phase: number; title: string; body: string }) {
  return (
    <Section title={`Coming in Phase ${phase}`}>
      <AppText variant="h3">{title}</AppText>
      <AppText tone="muted">{body}</AppText>
    </Section>
  );
}
