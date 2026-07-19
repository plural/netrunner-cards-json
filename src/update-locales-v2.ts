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

// English V2 Source Data
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

function writeJson(path: string, data: any) {
  const dir = join(path, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

const allDiscrepancies: string[] = [];

for (const locale of locales) {
  console.log(`Updating v2 locales for: ${locale}`);
  const localeV1Root = join(i18nDir, locale);
  const v2Root = resolve('.', 'v2', 'translations', locale);
  const cardsRoot = join(v2Root, 'cards');
  const printingsRoot = join(v2Root, 'printings');

  mkdirSync(v2Root, { recursive: true });
  mkdirSync(cardsRoot, { recursive: true });
  mkdirSync(printingsRoot, { recursive: true });

  // -------------------------------------------------------------
  // 1. Metadata Files (cycles, sets, factions, sides, types, subtypes)
  // -------------------------------------------------------------

  const processMetadata = (
    fileName: string,
    englishItems: any[],
    v1ItemsExtractor: () => { id: string; name: string }[]
  ) => {
    const filePath = join(v2Root, `${fileName}.json`);
    const engById = keyBy(englishItems, 'id');

    let existingV2: any[] = [];
    if (existsSync(filePath)) {
      try {
        existingV2 = JSON.parse(readFileSync(filePath, 'utf-8'));
      } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
      }
    }

    const v1Items = v1ItemsExtractor();
    const resultTrMap = new Map<string, string>();

    // First populate from existing V2
    existingV2.forEach(item => {
      if (item.id && item.name && item.name.trim() !== '') {
        resultTrMap.set(item.id, item.name);
      }
    });

    // Merge in V1 translations & track discrepancies
    v1Items.forEach(v1Item => {
      const eng = engById[v1Item.id];
      if (eng && v1Item.name && v1Item.name.trim() !== '') {
        const existingTr = resultTrMap.get(v1Item.id);
        if (existingTr && existingTr !== v1Item.name) {
          allDiscrepancies.push(
            `[${locale}] Metadata conflict for ${fileName}:${v1Item.id} - V2: "${existingTr}", V1: "${v1Item.name}"`
          );
        } else if (!existingTr) {
          resultTrMap.set(v1Item.id, v1Item.name);
        }
      }
    });

    // Build final updated array
    const updated: { id: string; name: string }[] = [];
    englishItems.forEach(eng => {
      const trName = resultTrMap.get(eng.id);
      if (trName && trName.trim() !== '') {
        updated.push({ id: eng.id, name: trName });
      }
    });

    if (updated.length > 0) {
      writeJson(filePath, updated);
    } else if (existsSync(filePath)) {
      rmSync(filePath);
    }
  };

  // Cycles
  processMetadata('card_cycles', v2Cycles, () => {
    const v1Path = join(localeV1Root, `cycles.${locale}.json`);
    if (!existsSync(v1Path)) return [];
    try {
      const v1Data = JSON.parse(readFileSync(v1Path, 'utf-8'));
      return v1Data
        .map((c: any) => {
          const v2C = v2CyclesByLegacyCode[c.code];
          return v2C ? { id: v2C.id, name: c.name } : null;
        })
        .filter((x: any) => x !== null);
    } catch {
      return [];
    }
  });

  // Sets
  processMetadata('card_sets', v2Sets, () => {
    const v1Path = join(localeV1Root, `packs.${locale}.json`);
    if (!existsSync(v1Path)) return [];
    try {
      const v1Data = JSON.parse(readFileSync(v1Path, 'utf-8'));
      return v1Data
        .map((p: any) => {
          const v2S = v2SetsByLegacyCode[p.code];
          return v2S ? { id: v2S.id, name: p.name } : null;
        })
        .filter((x: any) => x !== null);
    } catch {
      return [];
    }
  });

  // Factions
  processMetadata('factions', v2Factions, () => {
    const v1Path = join(localeV1Root, `factions.${locale}.json`);
    if (!existsSync(v1Path)) return [];
    try {
      const v1Data = JSON.parse(readFileSync(v1Path, 'utf-8'));
      return v1Data
        .map((f: any) => {
          const v2Id = f.code.replace(/-/g, '_');
          return v2FactionsById[v2Id] ? { id: v2Id, name: f.name } : null;
        })
        .filter((x: any) => x !== null);
    } catch {
      return [];
    }
  });

  // Sides
  processMetadata('sides', v2Sides, () => {
    const v1Path = join(localeV1Root, `sides.${locale}.json`);
    if (!existsSync(v1Path)) return [];
    try {
      const v1Data = JSON.parse(readFileSync(v1Path, 'utf-8'));
      return v1Data.map((s: any) => ({ id: s.code, name: s.name }));
    } catch {
      return [];
    }
  });

  // Types & Subtypes
  const typesV1Path = join(localeV1Root, `types.${locale}.json`);
  const v1TypesList: any[] = existsSync(typesV1Path)
    ? JSON.parse(readFileSync(typesV1Path, 'utf-8'))
    : [];

  processMetadata('card_types', v2Types, () => {
    const trTypes: { id: string; name: string }[] = [];
    v1TypesList.forEach((t: any) => {
      if (t.code === 'identity') {
        trTypes.push({ id: 'runner_identity', name: t.name });
        trTypes.push({ id: 'corp_identity', name: t.name });
      } else if (v2Types.some(v2T => v2T.id === t.code)) {
        trTypes.push({ id: t.code, name: t.name });
      }
    });
    return trTypes;
  });

  processMetadata('card_subtypes', v2Subtypes, () => {
    const trSubtypesMap = new Map<string, string>();
    v1TypesList.forEach((t: any) => {
      const subId = t.code.replace(/-/g, '_');
      if (v2SubtypeIds.has(subId) && t.name) {
        trSubtypesMap.set(subId, t.name);
      }
    });

    const localePackDir = join(localeV1Root, 'pack');
    if (existsSync(localePackDir)) {
      readdirSync(localePackDir).forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const cards = JSON.parse(readFileSync(join(localePackDir, file), 'utf-8'));
            cards.forEach((v1Card: any) => {
              if (!v1Card.keywords) return;
              const p = v2PrintingsById[v1Card.code];
              if (!p) return;
              const c = v2CardsById[p.card_id];
              if (!c || !c.subtypes) return;

              const v1KwList = v1Card.keywords.split(' - ').map((k: string) => k.trim());
              c.subtypes.forEach((engSubId: string, idx: number) => {
                const trKw = v1KwList[idx];
                if (trKw && !trSubtypesMap.has(engSubId)) {
                  trSubtypesMap.set(engSubId, trKw);
                }
              });
            });
          } catch (e) {
            console.error(`Error reading ${file}:`, e);
          }
        }
      });
    }

    return Array.from(trSubtypesMap.entries()).map(([id, name]) => ({ id, name }));
  });

  // -------------------------------------------------------------
  // 2. Card Files
  // -------------------------------------------------------------
  const englishCardIds = new Set(v2Cards.map(c => c.id));

  // Remove orphaned card files
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

  // Load existing V2 cards
  const v2CardsTrMap = new Map<string, any>();
  if (existsSync(cardsRoot)) {
    readdirSync(cardsRoot).forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const cardId = file.replace('.json', '');
          const tr = JSON.parse(readFileSync(join(cardsRoot, file), 'utf-8'));
          v2CardsTrMap.set(cardId, tr);
        } catch (e) {
          console.error(`Error reading ${file}:`, e);
        }
      }
    });
  }

  // Load V1 cards and synthesize translations
  const localePackDir = join(localeV1Root, 'pack');
  if (existsSync(localePackDir)) {
    readdirSync(localePackDir).forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const v1Cards = JSON.parse(readFileSync(join(localePackDir, file), 'utf-8'));
          v1Cards.forEach((v1Card: any) => {
            const p = v2PrintingsById[v1Card.code];
            if (!p) return;
            const c = v2CardsById[p.card_id];
            if (!c) return;

            let trCard = v2CardsTrMap.get(c.id);
            if (!trCard) {
              trCard = { id: c.id, title: null };
              v2CardsTrMap.set(c.id, trCard);
            }

            // Title
            if (v1Card.title && v1Card.title.trim() !== '' && v1Card.title !== c.title) {
              if (trCard.title && trCard.title !== v1Card.title) {
                allDiscrepancies.push(
                  `[${locale}] Card title conflict for ${c.id} - V2: "${trCard.title}", V1: "${v1Card.title}"`
                );
              } else if (!trCard.title) {
                trCard.title = v1Card.title;
              }
            }

            // Text
            if (v1Card.text && v1Card.text.trim() !== '') {
              if (c.layout_id === undefined || c.layout_id === 'normal') {
                if (v1Card.text !== c.text) {
                  if (trCard.text && trCard.text !== v1Card.text) {
                    allDiscrepancies.push(
                      `[${locale}] Card text conflict for ${c.id}`
                    );
                  } else if (!trCard.text) {
                    trCard.text = v1Card.text;
                  }
                }
              } else if (c.layout_id === 'flip') {
                const parts = v1Card.text.split(/\n(?:Flip side|umgedrehte Seite|背面)[:：]?\n/gi);
                if (parts[0] !== c.text && !trCard.text) {
                  trCard.text = parts[0];
                }
                if (parts[1] && !trCard.faces) {
                  trCard.faces = [{ title: null, text: parts[1] }];
                }
              } else if (c.layout_id === 'facade') {
                const parts = v1Card.text.split(/\nSide \d+: /);
                if (parts[0] !== c.text && !trCard.text) {
                  trCard.text = parts[0];
                }
                if (parts.length > 1 && !trCard.faces) {
                  const trFaces: any[] = [];
                  for (let i = 1; i < parts.length; i++) {
                    trFaces.push({ title: null, text: parts[i] });
                  }
                  trCard.faces = trFaces;
                }
              }
            }
          });
        } catch (e) {
          console.error(`Error reading ${file}:`, e);
        }
      }
    });
  }

  // Clean and save card files
  for (const card of v2Cards) {
    const cardPath = join(cardsRoot, `${card.id}.json`);
    const trCard = v2CardsTrMap.get(card.id);

    if (!trCard) {
      if (existsSync(cardPath)) rmSync(cardPath);
      continue;
    }

    const updatedTr: any = { id: card.id };
    let hasContent = false;

    // Check title
    if (trCard.title && trCard.title.trim() !== '' && trCard.title !== card.title) {
      updatedTr.title = trCard.title;
      hasContent = true;
    } else {
      updatedTr.title = null;
    }

    // Check text
    if (trCard.text && trCard.text.trim() !== '' && trCard.text !== card.text) {
      updatedTr.text = trCard.text;
      hasContent = true;
    }

    // Check faces
    if (card.faces && trCard.faces && Array.isArray(trCard.faces)) {
      const updatedFaces: any[] = [];
      card.faces.forEach((face, idx) => {
        const trFace = trCard.faces[idx];
        if (trFace) {
          let faceHasContent = false;
          let faceTitle: string | null = null;
          let faceText: string | undefined = undefined;

          if (trFace.title && trFace.title.trim() !== '' && trFace.title !== face.title) {
            faceTitle = trFace.title;
            faceHasContent = true;
          }
          if (trFace.text && trFace.text.trim() !== '' && trFace.text !== face.text) {
            faceText = trFace.text;
            faceHasContent = true;
          }
          if (faceHasContent) {
            const updatedFace: any = { title: faceTitle };
            if (faceText !== undefined) updatedFace.text = faceText;
            updatedFaces.push(updatedFace);
          }
        }
      });
      if (updatedFaces.length > 0) {
        updatedTr.faces = updatedFaces;
        hasContent = true;
      }
    }

    // Rule: do not write card file if the only populated field is id (i.e. hasContent is false)
    if (hasContent) {
      writeJson(cardPath, updatedTr);
    } else if (existsSync(cardPath)) {
      console.log(`Deleting empty/untranslated card file: ${cardPath}`);
      rmSync(cardPath);
    }
  }

  // -------------------------------------------------------------
  // 3. Printing Files
  // -------------------------------------------------------------
  const englishPrintingsBySet: Record<string, any[]> = {};
  v2Printings.forEach(p => {
    if (!englishPrintingsBySet[p.card_set_id]) {
      englishPrintingsBySet[p.card_set_id] = [];
    }
    englishPrintingsBySet[p.card_set_id].push(p);
  });

  // Remove orphaned printing set files
  if (existsSync(printingsRoot)) {
    readdirSync(printingsRoot).forEach(file => {
      if (file.endsWith('.json')) {
        const setId = file.replace('.json', '');
        if (!englishPrintingsBySet[setId]) {
          console.log(`Removing orphaned printings file: ${file}`);
          rmSync(join(printingsRoot, file));
        }
      }
    });
  }

  // Load existing V2 printings
  const v2PrintingsTrMap = new Map<string, any>();
  if (existsSync(printingsRoot)) {
    readdirSync(printingsRoot).forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const existing = JSON.parse(readFileSync(join(printingsRoot, file), 'utf-8'));
          existing.forEach((pr: any) => v2PrintingsTrMap.set(pr.id, pr));
        } catch (e) {
          console.error(`Error reading ${file}:`, e);
        }
      }
    });
  }

  // Extract V1 flavor text
  if (existsSync(localePackDir)) {
    readdirSync(localePackDir).forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const v1Cards = JSON.parse(readFileSync(join(localePackDir, file), 'utf-8'));
          v1Cards.forEach((v1Card: any) => {
            if (!v1Card.flavor || v1Card.flavor.trim() === '') return;
            const p = v2PrintingsById[v1Card.code];
            if (!p) return;

            let trPr = v2PrintingsTrMap.get(p.id);
            if (!trPr) {
              trPr = { id: p.id };
              v2PrintingsTrMap.set(p.id, trPr);
            }

            const flavorParts = v1Card.flavor.split('\n');
            const v2Flavor = p.faces
              ? [p.flavor].concat(p.faces.map((s: any) => s.flavor)).filter((f: any) => !!f).join('\n')
              : p.flavor;

            if (v1Card.flavor !== v2Flavor) {
              if (p.faces && p.faces.length > 0) {
                let faceIdx = 0;
                if (p.flavor) {
                  if (flavorParts[0] !== p.flavor && !trPr.flavor) {
                    trPr.flavor = flavorParts[0];
                  }
                  faceIdx = 1;
                }
                if (!trPr.faces) {
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
                  }
                }
              } else if (!trPr.flavor) {
                trPr.flavor = v1Card.flavor;
              }
            }
          });
        } catch (e) {
          console.error(`Error reading ${file}:`, e);
        }
      }
    });
  }

  // Clean and save set printings files
  for (const [setId, setPrs] of Object.entries(englishPrintingsBySet)) {
    const setPath = join(printingsRoot, `${setId}.json`);
    const updatedSetTr: any[] = [];

    for (const pr of setPrs) {
      const trPr = v2PrintingsTrMap.get(pr.id);
      if (trPr) {
        const updatedPr: any = { id: pr.id };
        let prHasContent = false;

        if (trPr.flavor && trPr.flavor.trim() !== '' && trPr.flavor !== pr.flavor) {
          updatedPr.flavor = trPr.flavor;
          prHasContent = true;
        }

        if (pr.faces && trPr.faces && Array.isArray(trPr.faces)) {
          const updatedFaces: any[] = [];
          pr.faces.forEach((face: any, idx: number) => {
            const trFace = trPr.faces[idx];
            if (trFace && trFace.flavor && trFace.flavor.trim() !== '' && trFace.flavor !== face.flavor) {
              updatedFaces.push({ flavor: trFace.flavor });
            }
          });
          if (updatedFaces.length > 0) {
            updatedPr.faces = updatedFaces;
            prHasContent = true;
          }
        }

        // Rule: do not add entry if the only populated field is id
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

// Summary of Discrepancies
console.log('\n==================================================');
if (allDiscrepancies.length > 0) {
  console.log(`=== Translation Discrepancies Summary (${allDiscrepancies.length}) ===`);
  allDiscrepancies.forEach(d => console.log(` - ${d}`));
} else {
  console.log(`=== Translation Discrepancies Summary: 0 Discrepancies Found ===`);
}
console.log('==================================================\n');
