import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { Button, LoadingDetail, Screen, Section, TextField, useToast } from '@/components/ui';
import { fetchConversation, leaveGroupChat, renameGroupChat, type ConversationInfo } from '@/features/chat/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** A group chat's details: name, who's in it, add people, leave. */
export default function ChatDetails() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const conv = Number(id);
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [name, setName] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchConversation(conv)
        .then((c) => {
          setInfo(c);
          setName(c?.name ?? '');
        })
        .catch(() => undefined);
    }, [conv]),
  );

  async function saveName() {
    try {
      await renameGroupChat(conv, name);
      toast(name.trim() ? 'Renamed' : 'Name removed');
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  function confirmLeave() {
    const leave = async () => {
      try {
        await leaveGroupChat(conv);
        toast('You left the chat');
        router.dismissTo('/messages');
      } catch (e) {
        toast(friendlyError(e));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Leave this group chat? You won’t get its messages anymore.')) leave();
      return;
    }
    Alert.alert('Leave this group chat?', 'You won’t get its messages anymore.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Chat details" />
      <Screen contentGap={t.space[5]}>
        {!info ? (
          <LoadingDetail />
        ) : (
          <>
            <View style={{ gap: t.space[2] }}>
              <TextField label="Chat name" optional value={name} onChangeText={setName} maxLength={60} onSubmitEditing={saveName} returnKeyType="done" />
              {name.trim() !== (info.name ?? '') ? <Button label="Save name" size="md" variant="secondary" onPress={saveName} /> : null}
            </View>
            <Section
              title={`In this chat (${info.members.length})`}
              action={{ label: 'Add people', onPress: () => router.push({ pathname: '/chat/new', params: { add: String(conv) } }) }}>
              {info.members.map((m) => (
                <PersonRow key={m.id} id={m.id} name={m.id === me ? 'You' : m.display_name} avatarUrl={m.avatar_url} />
              ))}
            </Section>
            <Button label="Leave chat" variant="ghost" onPress={confirmLeave} />
          </>
        )}
      </Screen>
    </View>
  );
}
