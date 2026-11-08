import { View } from 'react-native';

import { AppText, Button, Chip, TextField } from '@/components/ui';
import { MAX_PROMPTS, PROMPTS, promptLabel, type ProfilePrompt } from '@/features/profiles/prompts';
import { useTheme } from '@/theme';

/** Pick up to 3 prompts and answer them (150 characters each). */
export function PromptsEditor({ value, onChange }: { value: ProfilePrompt[]; onChange: (next: ProfilePrompt[]) => void }) {
  const t = useTheme();
  const unused = PROMPTS.filter((p) => !value.some((v) => v.key === p.key));
  return (
    <View style={{ gap: t.space[3] }}>
      <View style={{ gap: 2 }}>
        <AppText weight="bold">Prompts</AppText>
        <AppText variant="small" tone="muted">
          Pick up to {MAX_PROMPTS} so people get a feel for you. Skip anything that says where you usually are.
        </AppText>
      </View>
      {value.map((p, i) => (
        <View key={p.key} style={{ gap: t.space[1] }}>
          <TextField
            label={promptLabel(p.key)}
            value={p.answer}
            onChangeText={(answer) => onChange(value.map((v, j) => (j === i ? { ...v, answer } : v)))}
            maxLength={150}
            multiline
            placeholder={PROMPTS.find((x) => x.key === p.key)?.placeholder}
          />
          <Button label="Remove" size="md" variant="ghost" onPress={() => onChange(value.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${promptLabel(p.key)}`} />
        </View>
      ))}
      {value.length < MAX_PROMPTS ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {unused.map((p) => (
            <Chip key={p.key} label={p.label} onPress={() => onChange([...value, { key: p.key, answer: '' }])} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Answered prompts on a profile. */
export function PromptCards({ prompts }: { prompts: ProfilePrompt[] | null | undefined }) {
  const t = useTheme();
  if (!prompts?.length) return null;
  return (
    <View style={{ gap: t.space[3] }}>
      {prompts.map((p) => (
        <View key={p.key} style={{ gap: 2, padding: t.space[4], borderRadius: t.radius.lg, backgroundColor: t.colors.surface }}>
          <AppText variant="small" tone="muted" weight="bold">
            {promptLabel(p.key)}
          </AppText>
          <AppText variant="h3">{p.answer}</AppText>
        </View>
      ))}
    </View>
  );
}
