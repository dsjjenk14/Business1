import { Alert, Platform } from 'react-native';

/** Ask "Are you sure?" (a native dialog on phones, confirm() on the web), then run the action. */
export function confirmThen(title: string, body: string, action: () => void, confirmLabel = 'Yes') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) action();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: action },
  ]);
}
