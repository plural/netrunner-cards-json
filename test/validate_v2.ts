import fs from "fs";
import { resolve } from "path";
import Ajv2020 from "ajv/dist/2020"
import { getCyclesV2Json, getFactionsV2Json, getSetTypesV2Json, getSidesV2Json, getTypesV2Json } from "../src/index";
import chai = require('chai');
const expect = chai.expect;

const ajv = new Ajv2020({ strict: true, allErrors: true });

function validateAgainstSchema(schema_file, data) {
  const schema_path = resolve(__dirname, "../schema/v2", schema_file);
  const schema = JSON.parse(fs.readFileSync(schema_path, "utf-8"));
  const validate: any = ajv.compile(schema);
  validate(data);
  if (validate.errors) {
    expect.fail(ajv.errorsText(validate.errors));
  }
}

describe('Sides', () => {
  const sides = getSidesV2Json();
  it('sides.json passes schema validation', () => {
    validateAgainstSchema('side_schema.json', sides);
  });
});

describe('Factions', () => {
  const factions = getFactionsV2Json();
  it('factions.json passes schema validation', () => {
    validateAgainstSchema('faction_schema.json', factions);
  });
});

describe('Cycles', () => {
  const cycles = getCyclesV2Json();

  it('cycles.json passes schema validation', () => {
    validateAgainstSchema('cycle_schema.json', cycles);
  });
});

describe('SetTypes', () => {
  const set_types = getSetTypesV2Json();

  it('set_types.json passes schema validation', () => {
    validateAgainstSchema('set_types_schema.json', set_types);
  });

  it('set_types have proper name/code format', () => {
    set_types.forEach(function(st) {
      expect(st.code).to.equal(st.name.toLowerCase().replaceAll(' ', '_'));
    });
  });
});

describe('Types', () => {
  const types = getTypesV2Json();

  it('types.json passes schema validation', () => {
    validateAgainstSchema('type_schema.json', types);
  });

  it('types have proper name/code format', () => {
    types.forEach(function(t) {
      expect(t.code).to.equal(t.name.toLowerCase().replaceAll(' ', '_'));
    });
  });
});