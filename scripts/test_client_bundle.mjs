import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const forbiddenValues = ['SYP_TEST_AI_SECRET_DO_NOT_SHIP', 'SYP_TEST_PASSWORD_DO_NOT_SHIP'];
const forbiddenDevBypassMarkers = [
  'signInDevBypass',
  'syp_dev_role',
  'syp-dev-token',
  'dev-admin',
];
// The active SYP command center now reads operational records from Supabase.
// Keep the retired Firebase collections out of downloadable application code.
const forbiddenLegacyFirestoreCollections = [
  'meydanBasvurulari',
  'meydanBasvuruStats',
  'personelIzinler',
  'personelAnaKayitlari',
  'kronikSorunlar',
];

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEEPSEEK_API_KEY: forbiddenValues[0],
    VITE_PANEL_LOGIN_PASSWORD: forbiddenValues[1],
  },
});

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(js|html|map)$/.test(entry.name)) {
      if (entry.name.endsWith('.js')) {
        assert.ok(statSync(file).size <= 650 * 1024, `JavaScript chunk exceeds the 650 KB quality limit: ${file}`);
        assert.ok(!entry.name.toLowerCase().includes('exceljs'), `ExcelJS must not return to the client bundle: ${file}`);
      }
      const content = readFileSync(file, 'utf8');
      assert.ok(forbiddenValues.every((value) => !content.includes(value)), `A private setting reached the client bundle: ${file}`);
      assert.ok(!/VITE_(DEEPSEEK_API_KEY|PANEL_LOGIN_PASSWORD)/.test(content), `A legacy secret environment field reached the client bundle: ${file}`);

      // Faz 5 Güvenlik Denetimi: Dev bypass ve sahte token izleri production bundle içinde bulunamaz
      for (const marker of forbiddenDevBypassMarkers) {
        assert.ok(!content.includes(marker), `Faz 5 Güvenlik İhlali: Geliştirici bypass izi (${marker}) üretim bundle'ına sızdı: ${file}`);
      }

      for (const collection of forbiddenLegacyFirestoreCollections) {
        assert.ok(!content.includes(collection), `Retired Firebase collection (${collection}) reached the active client bundle: ${file}`);
      }

      // KVKK & Veri Gizliliği Denetimi: Statik personel başvuru dökümleri istemci paketine sızamaz
      const forbiddenPrivateDataMarkers = ['MUSTAFA KAYA', 'AHMET KOCABIYIK', 'KAMİLE ÇELİK', 'ZEYNEP AYDEMİR'];
      for (const marker of forbiddenPrivateDataMarkers) {
        assert.ok(!content.includes(marker), `KVKK Gizlilik İhlali: Statik personel verisi (${marker}) istemci paketine sızdı: ${file}`);
      }
    }
  }
}
scan('dist');
console.log('PASS: Client bundle excludes secrets, dev bypass markers, private personnel datasets, and retired Firebase collection references.');
