// Copy V1 translation files to V2 format. This should only be needed for bootstrapping.
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
  textToId,
} from './index.js';
import lodash from 'lodash';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
const { keyBy } = lodash;

const i18nDir = resolve('.', 'translations');
const locales = readdirSync(i18nDir).filter(
  f => existsSync(join(i18nDir, f)) && f !== '.DS_Store' && f !== 'schema'
);

const v2TargetDir = resolve('.', 'v2', 'translations');

// Load V2 English data
const v2Cycles = getCardCyclesV2Json();
const v2Sets = getCardSetsV2Json();
const v2Types = getCardTypesV2Json();
const v2Subtypes = getCardSubtypesV2Json();
const v2SubtypeIds = new Set(v2Subtypes.map(s => s.id));
const v2Factions = getFactionsV2Json();
const v2Sides = getSidesV2Json();
const v2Cards = getCardsV2Json();
const v2Printings = getPrintingsV2Json();

const v2CardsById = keyBy(v2Cards, 'id');
const v2PrintingsById = keyBy(v2Printings, 'id');

const v2CyclesByLegacyCode = keyBy(v2Cycles, 'legacy_code');
const v2SetsByLegacyCode = keyBy(v2Sets, 'legacy_code');
const v2FactionsById = keyBy(v2Factions, 'id');

// Load V1 English cards
const v1EngCards = new Map<string, any>();
const packDir = resolve('.', 'pack');
if (existsSync(packDir)) {
  readdirSync(packDir).forEach(file => {
    if (file.endsWith('.json')) {
      try {
        const cards = JSON.parse(readFileSync(join(packDir, file), 'utf-8'));
        cards.forEach((c: any) => v1EngCards.set(c.code, c));
      } catch (e) {
        console.error(`Error loading English pack ${file}:`, e);
      }
    }
});
}

function writeJson(path: string, data: any) {
  const dir = join(path, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// Migrate each locale
for (const locale of locales) {
  console.log(`Migrating translations for locale: ${locale}`);
  const localeV1Root = join(i18nDir, locale);
  const localeV2Root = join(v2TargetDir, locale);

  // 1. Cycles
  const cyclesV1Path = join(localeV1Root, `cycles.${locale}.json`);
  if (existsSync(cyclesV1Path)) {
    try {
      const v1Cycles = JSON.parse(readFileSync(cyclesV1Path, 'utf-8'));
      const trCycles: any[] = [];
      v1Cycles.forEach((c: any) => {
        const v2C = v2CyclesByLegacyCode[c.code];
        if (v2C) {
          trCycles.push({ id: v2C.id, name: c.name });
        }
      });
      if (trCycles.length > 0) {
        writeJson(join(localeV2Root, 'card_cycles.json'), trCycles);
      }
    } catch (e) {
      console.error(`Error migrating cycles for ${locale}:`, e);
    }
  }

  // 2. Packs (Sets)
  const packsV1Path = join(localeV1Root, `packs.${locale}.json`);
  if (existsSync(packsV1Path)) {
    try {
      const v1Packs = JSON.parse(readFileSync(packsV1Path, 'utf-8'));
      const trSets: any[] = [];
      v1Packs.forEach((p: any) => {
        const v2S = v2SetsByLegacyCode[p.code];
        if (v2S) {
          trSets.push({ id: v2S.id, name: p.name });
        }
      });
      if (trSets.length > 0) {
        writeJson(join(localeV2Root, 'card_sets.json'), trSets);
      }
    } catch (e) {
      console.error(`Error migrating packs for ${locale}:`, e);
    }
  }

  // 3. Factions
  const factionsV1Path = join(localeV1Root, `factions.${locale}.json`);
  const subtypeFromTypes = new Map<string, string>();
  if (existsSync(factionsV1Path)) {
    try {
      const v1Factions = JSON.parse(readFileSync(factionsV1Path, 'utf-8'));
      const trFactions: any[] = [];
      v1Factions.forEach((f: any) => {
        const v2Id = f.code.replace(/-/g, '_');
        if (v2FactionsById[v2Id]) {
          trFactions.push({ id: v2Id, name: f.name });
        }
      });
      if (trFactions.length > 0) {
        writeJson(join(localeV2Root, 'factions.json'), trFactions);
      }
    } catch (e) {
      console.error(`Error migrating factions for ${locale}:`, e);
    }
  }

  // 4. Sides
  const sidesV1Path = join(localeV1Root, `sides.${locale}.json`);
  if (existsSync(sidesV1Path)) {
    try {
      const v1Sides = JSON.parse(readFileSync(sidesV1Path, 'utf-8'));
      const trSides: any[] = [];
      v1Sides.forEach((s: any) => {
        trSides.push({ id: s.code, name: s.name });
      });
      if (trSides.length > 0) {
        writeJson(join(localeV2Root, 'sides.json'), trSides);
      }
    } catch (e) {
      console.error(`Error migrating sides for ${locale}:`, e);
    }
  }

  // 5. Types
  const typesV1Path = join(localeV1Root, `types.${locale}.json`);
  if (existsSync(typesV1Path)) {
    try {
      const v1Types = JSON.parse(readFileSync(typesV1Path, 'utf-8'));
      const trTypes: any[] = [];
      v1Types.forEach((t: any) => {
        if (t.code === 'identity') {
          trTypes.push({ id: 'runner_identity', name: t.name });
          trTypes.push({ id: 'corp_identity', name: t.name });
        } else if (v2Types.some(v2T => v2T.id === t.code)) {
          trTypes.push({ id: t.code, name: t.name });
        } else {
          const subId = t.code.replace(/-/g, '_');
          if (v2SubtypeIds.has(subId)) {
            subtypeFromTypes.set(subId, t.name);
          }
        }
      });
      if (trTypes.length > 0) {
        writeJson(join(localeV2Root, 'card_types.json'), trTypes);
      }
    } catch (e) {
      console.error(`Error migrating types for ${locale}:`, e);
    }
  }

  // 6. Subtypes (Keywords translation mapping)
  const subtypeTranslations = new Map<string, string>(subtypeFromTypes);
  const localePackDir = join(localeV1Root, 'pack');
  const localeV1Cards: any[] = [];

  if (existsSync(localePackDir)) {
    readdirSync(localePackDir).forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const cards = JSON.parse(readFileSync(join(localePackDir, file), 'utf-8'));
          cards.forEach((c: any) => {
            localeV1Cards.push(c);
            const engCard = v1EngCards.get(c.code);
            if (engCard && engCard.keywords && c.keywords) {
              const engParts = engCard.keywords.split(' - ');
              const trParts = c.keywords.split(' - ');
              if (engParts.length === trParts.length) {
                engParts.forEach((part: string, idx: number) => {
                  const id = textToId(part);
                  if (v2SubtypeIds.has(id)) {
                    subtypeTranslations.set(id, trParts[idx]);
                  }
                });
              }
            }
          });
        } catch (e) {
          console.error(`Error loading pack translation ${file} for ${locale}:`, e);
        }
      }
    });
  }

  const trSubtypes = Array.from(subtypeTranslations.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (trSubtypes.length > 0) {
    writeJson(join(localeV2Root, 'card_subtypes.json'), trSubtypes);
  }

  // 7. Cards & Printings
  const printingsBySet: Record<string, any[]> = {};
  const cardsTrMap = new Map<string, any>();

  localeV1Cards.forEach((v1Card: any) => {
    const p = v2PrintingsById[v1Card.code];
    if (!p) return;

    const c = v2CardsById[p.card_id];
    if (!c) return;

    // Card text & title accumulation
    let trCard = cardsTrMap.get(c.id);
    if (!trCard) {
      trCard = { id: c.id, title: null };
      cardsTrMap.set(c.id, trCard);
    }

    if (v1Card.title && v1Card.title.trim() !== '' && v1Card.title !== c.title) {
      trCard.title = v1Card.title;
    }

    if (v1Card.text && v1Card.text.trim() !== '') {
      if (c.layout_id === undefined || c.layout_id === 'normal') {
        if (v1Card.text !== c.text) {
          trCard.text = v1Card.text;
        }
      } else if (c.layout_id === 'flip') {
        const parts = v1Card.text.split(/\n(?:Flip side|umgedrehte Seite|背面)[:：]?\n/gi);
        if (parts[0] !== c.text) {
          trCard.text = parts[0];
        }
        if (parts[1]) {
          trCard.faces = [
            {
              title: null,
              text: parts[1],
            },
          ];
        }
      } else if (c.layout_id === 'facade') {
        const parts = v1Card.text.split(/\nSide \d+: /);
        if (parts[0] !== c.text) {
          trCard.text = parts[0];
        }
        const trFaces: any[] = [];
        for (let i = 1; i < parts.length; i++) {
          trFaces.push({
            title: null,
            text: parts[i],
          });
        }
        if (trFaces.length > 0) {
          trCard.faces = trFaces;
        }
      }
    }

    // Printing flavor text
    if (v1Card.flavor && v1Card.flavor.trim() !== '') {
      const trPr: any = { id: p.id };
      let hasPrintingContent = false;

      const flavorParts = v1Card.flavor.split('\n');
      let v2Flavor = p.faces
        ? [p.flavor].concat(p.faces.map((s: any) => s.flavor)).filter((f: any) => !!f).join('\n')
        : p.flavor;

      if (v1Card.flavor !== v2Flavor) {
        if (p.faces && p.faces.length > 0) {
          let faceIdx = 0;
          if (p.flavor) {
            if (flavorParts[0] !== p.flavor) {
              trPr.flavor = flavorParts[0];
              hasPrintingContent = true;
            }
            faceIdx = 1;
          }
          const trFaces: any[] = [];
          p.faces.forEach((face: any, idx: number) => {
            const part = flavorParts[faceIdx + idx];
            if (part && part !== face.flavor) {
              trFaces.push({ flavor: part });
            } else {
              trFaces.push({ flavor: null });
            }
          });
          if (trFaces.some((f: any) => f.flavor !== null)) {
            trPr.faces = trFaces;
            hasPrintingContent = true;
          }
        } else {
          trPr.flavor = v1Card.flavor;
          hasPrintingContent = true;
        }
      }

      if (hasPrintingContent) {
        if (!printingsBySet[p.card_set_id]) {
          printingsBySet[p.card_set_id] = [];
        }
        // Avoid duplicate printings in set
        if (!printingsBySet[p.card_set_id].some(pr => pr.id === trPr.id)) {
          printingsBySet[p.card_set_id].push(trPr);
        }
      }
    }
  });

  // Write card files if they have any content (other than id and title=null)
  for (const trCard of cardsTrMap.values()) {
    let hasContent = false;
    if (trCard.title !== null) hasContent = true;
    if (trCard.text !== undefined) hasContent = true;
    if (trCard.faces !== undefined) hasContent = true;

    if (hasContent) {
      writeJson(join(localeV2Root, 'cards', `${trCard.id}.json`), trCard);
    }
  }

  // Write printings set files
  for (const [setId, trPrs] of Object.entries(printingsBySet)) {
    if (trPrs.length > 0) {
      writeJson(join(localeV2Root, 'printings', `${setId}.json`), trPrs);
    }
  }
}
