/**
 * A small JSON Schema validator, dependency-free on purpose.
 *
 * This repository has no root package.json and no installed toolchain: CI
 * installs from the composed platform checkout, and nothing here should add a
 * dependency just to read a schema. So the schema is written in the subset of
 * JSON Schema this file implements, and this file FAILS on any keyword it does
 * not implement. That is the point: the schema and the validator cannot drift
 * silently. Adding a keyword to schema/plugin-manifest.schema.json without
 * teaching this file about it turns the check red instead of being ignored.
 *
 * Supported: $ref (local only), $defs, type, enum, const, pattern, minLength,
 * maxLength, minimum, maximum, minItems, maxItems, uniqueItems, items,
 * required, properties, additionalProperties (boolean), oneOf, anyOf.
 * Annotation-only: $schema, $id, $comment, title, description, examples,
 * default, deprecated.
 */

const ANNOTATIONS = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'examples', 'default', 'deprecated',
]);

const SUPPORTED = new Set([
  '$ref', '$defs', 'type', 'enum', 'const', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'minItems', 'maxItems', 'uniqueItems', 'items',
  'required', 'properties', 'additionalProperties', 'oneOf', 'anyOf',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  if (type === 'integer') return actual === 'integer';
  return actual === type;
}

function resolveRef(ref, root, where) {
  if (!ref.startsWith('#/')) {
    throw new Error(where + ': only local $ref ("#/$defs/name") is supported, got "' + ref + '"');
  }
  const segments = ref.slice(2).split('/');
  let node = root;
  for (const segment of segments) {
    if (node === null || typeof node !== 'object' || !(segment in node)) {
      throw new Error(where + ': unresolvable $ref "' + ref + '"');
    }
    node = node[segment];
  }
  return node;
}

/**
 * @returns {string[]} human-readable errors, each prefixed with the instance path
 */
export function validate(instance, schema, root = schema, path = '$') {
  const errors = [];

  if (schema === true || schema === undefined) return errors;
  if (schema === null || typeof schema !== 'object') {
    return [path + ': schema node is not an object'];
  }

  if (schema.$ref !== undefined) {
    const target = resolveRef(schema.$ref, root, path);
    return validate(instance, target, root, path);
  }

  for (const keyword of Object.keys(schema)) {
    if (ANNOTATIONS.has(keyword)) continue;
    if (!SUPPORTED.has(keyword)) {
      errors.push(path + ': schema uses unsupported keyword "' + keyword + '" - teach scripts/capabilities/schema.mjs about it');
    }
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(instance, t))) {
      errors.push(path + ': expected ' + types.join(' or ') + ', got ' + typeOf(instance));
      return errors; // further keywords would only add noise
    }
  }

  if (schema.const !== undefined && JSON.stringify(instance) !== JSON.stringify(schema.const)) {
    errors.push(path + ': expected the constant ' + JSON.stringify(schema.const));
  }

  if (schema.enum !== undefined && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(instance))) {
    errors.push(path + ': ' + JSON.stringify(instance) + ' is not one of ' + JSON.stringify(schema.enum));
  }

  if (typeof instance === 'string') {
    if (schema.pattern !== undefined) {
      if (!new RegExp(schema.pattern, 'u').test(instance)) {
        errors.push(path + ': "' + instance + '" does not match ' + schema.pattern);
      }
    }
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      errors.push(path + ': shorter than ' + schema.minLength);
    }
    if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
      errors.push(path + ': longer than ' + schema.maxLength);
    }
  }

  if (typeof instance === 'number') {
    if (schema.minimum !== undefined && instance < schema.minimum) errors.push(path + ': below minimum ' + schema.minimum);
    if (schema.maximum !== undefined && instance > schema.maximum) errors.push(path + ': above maximum ' + schema.maximum);
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push(path + ': needs at least ' + schema.minItems + ' item(s), has ' + instance.length);
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push(path + ': allows at most ' + schema.maxItems + ' item(s), has ' + instance.length);
    }
    if (schema.uniqueItems === true) {
      const seen = new Map();
      instance.forEach((value, index) => {
        const key = JSON.stringify(value);
        if (seen.has(key)) errors.push(path + '[' + index + ']: duplicate of $[' + seen.get(key) + '] value ' + key);
        else seen.set(key, index);
      });
    }
    if (schema.items !== undefined) {
      instance.forEach((value, index) => {
        errors.push(...validate(value, schema.items, root, path + '[' + index + ']'));
      });
    }
  }

  if (instance !== null && typeof instance === 'object' && !Array.isArray(instance)) {
    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!(key in instance)) errors.push(path + ': missing required property "' + key + '"');
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, value] of Object.entries(instance)) {
      if (key in properties) {
        errors.push(...validate(value, properties[key], root, path + '.' + key));
      } else if (schema.additionalProperties === false) {
        errors.push(path + ': unexpected property "' + key + '"');
      }
    }
  }

  for (const branch of schema.oneOf ?? []) {
    if (validate(instance, branch, root, path).length === 0) {
      errors.__matched = (errors.__matched ?? 0) + 1;
    }
  }
  if (schema.oneOf !== undefined && (errors.__matched ?? 0) !== 1) {
    errors.push(path + ': must match exactly one of ' + schema.oneOf.length + ' schemas, matched ' + (errors.__matched ?? 0));
  }
  delete errors.__matched;

  if (schema.anyOf !== undefined) {
    const matched = schema.anyOf.some((branch) => validate(instance, branch, root, path).length === 0);
    if (!matched) errors.push(path + ': matches none of ' + schema.anyOf.length + ' allowed schemas');
  }

  return errors;
}
