import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import {
  getCardCyclesV2Json,
  getCardSetsV2Json,
  getCardTypesV2Json,
  getCardSubtypesV2Json,
  getFactionsV2Json,
  getSidesV2Json,
  getCardsV2Json,
  getPrintingsV2Json,
} from './index.js';
import lodash from 'lodash';
const { keyBy } = lodash;

const i18nDir = resolve('.', 'translations');
const locales = readdirSync(i18nDir).filter(
  f => existsSync(join(i18nDir, f)) && f !== '.DS_Store' && f !== 'schema'
);

const metadataTypes = [
  { name: 'card_cycles', getter: getCardCyclesV2Json },
  { name: 'card_sets', getter: getCardSetsV2Json },
  { name: 'card_types', getter: getCardTypesV2Json },
  { name: 'card_subtypes', getter: getCardSubtypesV2Json },
  { name: 'factions', getter: getFactionsV2Json },
  { name: 'sides', getter: getSidesV2Json },
];

function writeJson(path: string, data: any) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// Process locales
for (const locale of locales) {
  console.log(`Updating v2 locales for: ${locale}`);
  const v2Root = resolve('.', 'v2', 'translations', locale);
  const cardsRoot = join(v2Root, 'cards');
  const printingsRoot = join(v2Root, 'printings');

  mkdirSync(v2Root, { recursive: true });
  mkdirSync(cardsRoot, { recursive: true });
  mkdirSync(printingsRoot, { recursive: true });

  // A. Metadata files
  for (const meta of metadataTypes) {
    const filepath = join(v2Root, `${meta.name}.json`);
    const englishItems = meta.getter();
    const englishIds = new Set(englishItems.map(item => item.id));

    let existing: any[] = [];
    if (existsSync(filepath)) {
      try {
        existing = JSON.parse(readFileSync(filepath, 'utf-8'));
      } catch (e) {
        console.error(`Error reading ${filepath}:`, e);
      }
    }

    // Filter to keep only translations that still exist in English source and are translated
    const updated = existing
      .filter(item => englishIds.has(item.id) && item.name && item.name.trim() !== '')
      .map(item => ({ id: item.id, name: item.name }));

    if (updated.length > 0) {
      writeJson(filepath, updated);
    } else if (existsSync(filepath)) {
      rmSync(filepath);
    }
  }

  // B. Card files
  const englishCards = getCardsV2Json();
  const englishCardIds = new Set(englishCards.map(c => c.id));

  // Remove translated card files that no longer exist in English
  if (existsSync(cardsRoot)) {
    readdirSync(cardsRoot).forEach(file => {
      if (file.endsWith('.json')) {
        const cardId = file.replace('.json', '');
        if (!englishCardIds.has(cardId)) {
          console.log(`Removing orphaned translation card file: ${file}`);
          rmSync(join(cardsRoot, file));
        }
      }
    });
  }

  // Update existing card translations
  for (const card of englishCards) {
    const cardPath = join(cardsRoot, `${card.id}.json`);
    if (existsSync(cardPath)) {
      try {
        const tr = JSON.parse(readFileSync(cardPath, 'utf-8'));
        const updatedTr: any = { id: card.id };
        let hasContent = false;

        if (tr.title && tr.title.trim() !== '' && tr.title !== card.title) {
          updatedTr.title = tr.title;
          hasContent = true;
        }
        if (tr.text && tr.text.trim() !== '' && tr.text !== card.text) {
          updatedTr.text = tr.text;
          hasContent = true;
        }

        if (card.faces && tr.faces && Array.isArray(tr.faces)) {
          const updatedFaces: any[] = [];
          card.faces.forEach((face, idx) => {
            const trFace = tr.faces[idx];
            if (trFace) {
              const updatedFace: any = {};
              let faceHasContent = false;
              if (trFace.title && trFace.title.trim() !== '' && trFace.title !== face.title) {
                updatedFace.title = trFace.title;
                faceHasContent = true;
              }
              if (trFace.text && trFace.text.trim() !== '' && trFace.text !== face.text) {
                updatedFace.text = trFace.text;
                faceHasContent = true;
              }
              if (faceHasContent) {
                updatedFaces.push(updatedFace);
              }
            }
          });
          if (updatedFaces.length > 0) {
            updatedTr.faces = updatedFaces;
            hasContent = true;
          }
        }

        if (hasContent) {
          writeJson(cardPath, updatedTr);
        } else {
          console.log(`Deleting empty/untranslated card file: ${cardPath}`);
          rmSync(cardPath);
        }
      } catch (e) {
        console.error(`Error processing card translation ${cardPath}:`, e);
      }
    }
  }

  // C. Printing files
  const englishPrintings = getPrintingsV2Json();
  // Group printings by set
  const printingsBySet: Record<string, any[]> = {};
  englishPrintings.forEach(p => {
    if (!printingsBySet[p.card_set_id]) {
      printingsBySet[p.card_set_id] = [];
    }
    printingsBySet[p.card_set_id].push(p);
  });

  // Remove orphaned printings files
  if (existsSync(printingsRoot)) {
    readdirSync(printingsRoot).forEach(file => {
      if (file.endsWith('.json')) {
        const setId = file.replace('.json', '');
        if (!printingsBySet[setId]) {
          console.log(`Removing orphaned printings file: ${file}`);
          rmSync(join(printingsRoot, file));
        }
      }
    });
  }

  // Process set printings
  for (const [setId, setPrs] of Object.entries(printingsBySet)) {
    const setPath = join(printingsRoot, `${setId}.json`);
    let existing: any[] = [];
    if (existsSync(setPath)) {
      try {
        existing = JSON.parse(readFileSync(setPath, 'utf-8'));
      } catch (e) {
        console.error(`Error reading ${setPath}:`, e);
      }
    }

    const existingById = keyBy(existing, 'id');
    const updatedSetTr: any[] = [];

    for (const pr of setPrs) {
      const tr = existingById[pr.id];
      if (tr) {
        const updatedPr: any = { id: pr.id };
        let prHasContent = false;

        if (tr.flavor && tr.flavor.trim() !== '' && tr.flavor !== pr.flavor) {
          updatedPr.flavor = tr.flavor;
          prHasContent = true;
        }

        if (pr.faces && tr.faces && Array.isArray(tr.faces)) {
          const updatedFaces: any[] = [];
          pr.faces.forEach((face, idx) => {
            const trFace = tr.faces[idx];
            if (trFace && trFace.flavor && trFace.flavor.trim() !== '' && trFace.flavor !== face.flavor) {
              updatedFaces.push({ flavor: trFace.flavor });
            }
          });
          if (updatedFaces.length > 0) {
            updatedPr.faces = updatedFaces;
            prHasContent = true;
          }
        }

        if (prHasContent) {
          updatedSetTr.push(updatedPr);
        }
      }
    }

    if (updatedSetTr.length > 0) {
      writeJson(setPath, updatedSetTr);
    } else if (existsSync(setPath)) {
      rmSync(setPath);
    }
  }
}
