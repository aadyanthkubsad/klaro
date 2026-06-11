/**
 * One-time migration: klaro: → lumina: localStorage keys.
 *
 * Copies data from old "klaro:" prefixed keys to new "lumina:" keys so
 * existing sessions survive the rebrand. Runs synchronously when imported
 * — MUST be imported before AuthContext or any service that reads lumina: keys.
 */

const MIGRATED_FLAG = 'lumina:migrated-from-klaro';

try {
  if (!localStorage.getItem(MIGRATED_FLAG)) {
    const KEY_MAP: [string, string][] = [
      ['klaro:auth-token',      'lumina:auth-token'],
      ['klaro:user-email',      'lumina:user-email'],
      ['klaro:plan',            'lumina:plan'],
      ['klaro:usage',           'lumina:usage'],
      ['klaro:user-profile',    'lumina:user-profile'],
      ['klaro:profile-picture', 'lumina:profile-picture'],
      ['klaro:theme',           'lumina:theme'],
      ['klaro:activityLog',     'lumina:activityLog'],
      ['klaro:streak',          'lumina:streak'],
      ['klaro:examDates',       'lumina:examDates'],
      ['klaro:writtenAnswers',  'lumina:writtenAnswers'],
      ['klaro:lastLearningMode','lumina:lastLearningMode'],
    ];

    let migrated = 0;
    for (const [oldKey, newKey] of KEY_MAP) {
      const val = localStorage.getItem(oldKey);
      if (val && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, val);
        migrated++;
      }
    }

    localStorage.setItem(MIGRATED_FLAG, '1');
    if (migrated > 0) {
      console.log(`[Lumina] Migrated ${migrated} localStorage keys from klaro: → lumina:`);
    }
  }
} catch { /* ignore — SSR or storage unavailable */ }
