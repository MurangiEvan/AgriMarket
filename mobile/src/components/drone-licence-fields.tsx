import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api';

type DroneLicence = { sacaaRplNumber: string | null; sacaaRocNumber: string | null; droneLicenceVerified: boolean };

// Shown when a seller offers drone services. SACAA requires a Remote Pilot Licence (RPL) and a
// Remote Operating Certificate (ROC) for commercial drone work; an administrator checks both
// against the uploaded licence before any drone listing is published.
export function DroneLicenceFields() {
  const [saved, setSaved] = useState<DroneLicence | null>(null);
  const [rpl, setRpl] = useState('');
  const [roc, setRoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<{ business: DroneLicence | null }>('/seller/business')
      .then(({ business }) => {
        if (!active || !business) return;
        setSaved(business);
        setRpl(business.sacaaRplNumber ?? '');
        setRoc(business.sacaaRocNumber ?? '');
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ business: DroneLicence }>('/seller/business/drone-licence', {
        method: 'PUT',
        body: JSON.stringify({ sacaaRplNumber: rpl.trim(), sacaaRocNumber: roc.trim() }),
      });
      setSaved(result.business);
      setNotice(result.business.droneLicenceVerified ? 'Saved.' : 'Saved. An administrator will check your licence before your drone listing goes live.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your licence numbers could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const unchanged = saved && rpl.trim() === (saved.sacaaRplNumber ?? '') && roc.trim() === (saved.sacaaRocNumber ?? '');
  const canSave = rpl.trim().length >= 3 && roc.trim().length >= 3 && !busy && !unchanged;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>SACAA drone licence</Text>
      <Text style={styles.body}>
        Commercial drone work in South Africa needs a Remote Pilot Licence (RPL) and a Remote Operating Certificate (ROC) from the South African Civil Aviation Authority. Enter both numbers exactly as printed, and upload a copy of the licence with your documents.
      </Text>
      {saved?.droneLicenceVerified && unchanged ? <Text style={styles.verified}>✓ Licence checked by AgriMarket</Text> : null}
      <Text style={styles.label}>Remote Pilot Licence (RPL) number</Text>
      <TextInput accessibilityLabel="Remote Pilot Licence number" placeholder="As printed on your RPL" placeholderTextColor="#7a877f" autoCapitalize="characters" maxLength={40} value={rpl} onChangeText={setRpl} style={styles.input} />
      <Text style={styles.label}>Remote Operating Certificate (ROC) number</Text>
      <TextInput accessibilityLabel="Remote Operating Certificate number" placeholder="As printed on your ROC" placeholderTextColor="#7a877f" autoCapitalize="characters" maxLength={40} value={roc} onChangeText={setRoc} style={styles.input} />
      {saved && !unchanged && saved.droneLicenceVerified ? <Text style={styles.note}>Changing a number means the administrator checks your licence again.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!canSave} onPress={() => void save()} style={canSave ? styles.button : styles.buttonDisabled}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save licence numbers'}</Text>
      </Pressable>
    </View>
  );
}

const button = { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#183f32' } as const;

const styles = StyleSheet.create({
  box: { marginTop: 4, padding: 14, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: '#d4bc83', backgroundColor: '#fbf6e8' },
  title: { color: '#183f32', fontSize: 15, fontWeight: '800' },
  body: { color: '#4d4630', fontSize: 12, lineHeight: 18 },
  label: { color: '#183f32', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', backgroundColor: '#fffefa' },
  verified: { color: '#236449', fontSize: 12, fontWeight: '800' },
  note: { color: '#7a6a4f', fontSize: 11, lineHeight: 16 },
  error: { color: '#a23b32', fontSize: 12, lineHeight: 18 },
  success: { color: '#236449', fontSize: 12, lineHeight: 18 },
  button,
  buttonDisabled: { ...button, opacity: 0.45 },
  buttonText: { color: '#fffefa', fontSize: 13, fontWeight: '800' },
});
