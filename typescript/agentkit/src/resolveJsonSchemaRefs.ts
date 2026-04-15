/**
 * Resolves `$ref` pointers in JSON Schema objects by inlining the referenced
 * definitions. This is necessary because `zodToJsonSchema()` and `z.toJSONSchema()`
 * produce `$ref` pointers for recursive and reused Zod types (e.g. `z.lazy()`),
 * which some LLM function-calling APIs reject.
 *
 * @see https://github.com/coinbase/agentkit/issues/815
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonSchemaObject = Record<string, any>;

/**
 * Resolves all `$ref` pointers in a JSON Schema by inlining the referenced
 * definitions from `$defs` or `definitions`. For recursive schemas, inlining
 * stops at `maxDepth` to prevent infinite expansion, replacing deeper levels
 * with a permissive empty object schema.
 *
 * @param schema - A JSON Schema object, typically from `z.toJSONSchema()` or `zodToJsonSchema()`
 * @param maxDepth - Maximum recursion depth for inlining `$ref` pointers (default: 3)
 * @returns A new JSON Schema with all `$ref` pointers resolved
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { resolveJsonSchemaRefs } from "@coinbase/agentkit";
 *
 * const recursive = z.object({
 *   value: z.string(),
 *   children: z.lazy(() => recursive).array().optional(),
 * });
 *
 * const jsonSchema = z.toJSONSchema(recursive);
 * const flat = resolveJsonSchemaRefs(jsonSchema);
 * // flat has no $ref — safe for OpenAI / Anthropic / other function-calling APIs
 * ```
 */
export function resolveJsonSchemaRefs(
  schema: JsonSchemaObject,
  maxDepth: number = 3,
): JsonSchemaObject {
  const defs: JsonSchemaObject = schema.$defs ?? schema.definitions ?? {};

  const result = resolveNode(schema, defs, maxDepth, 0, new Set<string>());

  // Strip definition blocks from the output — they are fully inlined
  const { $defs: _d, definitions: _dd, ...clean } = result;
  return clean;
}

/**
 * Recursively resolves a single JSON Schema node.
 */
function resolveNode(
  node: unknown,
  defs: JsonSchemaObject,
  maxDepth: number,
  currentDepth: number,
  activeRefs: Set<string>,
): JsonSchemaObject {
  if (node === null || node === undefined || typeof node !== "object") {
    return node as JsonSchemaObject;
  }

  if (Array.isArray(node)) {
    return node.map(item => resolveNode(item, defs, maxDepth, currentDepth, activeRefs));
  }

  const obj = node as JsonSchemaObject;

  // Handle $ref
  if (typeof obj.$ref === "string") {
    const refName = extractRefName(obj.$ref);
    if (!refName || !defs[refName]) {
      // Unknown ref — return as-is rather than failing
      return obj;
    }

    // Detect circular reference or depth limit
    if (activeRefs.has(refName) || currentDepth >= maxDepth) {
      // At max depth for recursive types, emit a permissive schema
      return { type: "object", additionalProperties: true };
    }

    const nextRefs = new Set(activeRefs);
    nextRefs.add(refName);

    return resolveNode(defs[refName], defs, maxDepth, currentDepth + 1, nextRefs);
  }

  // Recurse into all object properties
  const resolved: JsonSchemaObject = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "$defs" || key === "definitions") {
      continue; // Skip definition blocks — they get inlined
    }
    resolved[key] = resolveNode(value, defs, maxDepth, currentDepth, activeRefs);
  }

  return resolved;
}

/**
 * Extracts the definition name from a `$ref` pointer.
 * Supports `#/$defs/Name` and `#/definitions/Name` formats.
 */
function extractRefName(ref: string): string | null {
  const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
  return match?.[1] ?? null;
}
