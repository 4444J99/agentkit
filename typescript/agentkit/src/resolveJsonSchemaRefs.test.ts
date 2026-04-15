import { resolveJsonSchemaRefs } from "./resolveJsonSchemaRefs";

describe("resolveJsonSchemaRefs", () => {
  it("should return schema unchanged when no $ref present", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };

    expect(resolveJsonSchemaRefs(schema)).toEqual(schema);
  });

  it("should inline a simple $ref from $defs", () => {
    const schema = {
      type: "object",
      properties: {
        address: { $ref: "#/$defs/Address" },
      },
      $defs: {
        Address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
        },
      },
    };

    const result = resolveJsonSchemaRefs(schema);

    expect(result).toEqual({
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
        },
      },
    });
    expect(result.$defs).toBeUndefined();
  });

  it("should inline a simple $ref from definitions", () => {
    const schema = {
      type: "object",
      properties: {
        item: { $ref: "#/definitions/Item" },
      },
      definitions: {
        Item: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
      },
    };

    const result = resolveJsonSchemaRefs(schema);

    expect(result).toEqual({
      type: "object",
      properties: {
        item: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
      },
    });
    expect(result.definitions).toBeUndefined();
  });

  it("should inline recursive $ref up to maxDepth", () => {
    const schema = {
      type: "object",
      properties: {
        value: { type: "string" },
        children: {
          type: "array",
          items: { $ref: "#/$defs/Node" },
        },
      },
      $defs: {
        Node: {
          type: "object",
          properties: {
            value: { type: "string" },
            children: {
              type: "array",
              items: { $ref: "#/$defs/Node" },
            },
          },
        },
      },
    };

    const result = resolveJsonSchemaRefs(schema, 2);

    // Depth 0: root -> inlines Node (depth 1)
    // Depth 1: Node.children.items -> inlines Node (depth 2)
    // Depth 2: Node.children.items -> max depth, permissive schema
    expect(result.properties.children.items.properties.value.type).toBe("string");
    expect(result.properties.children.items.properties.children.items.properties.value.type).toBe(
      "string",
    );
    expect(
      result.properties.children.items.properties.children.items.properties.children.items,
    ).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(result.$defs).toBeUndefined();
  });

  it("should handle union types with $ref (issue #815 regression)", () => {
    // This reproduces the exact pattern from issue #815: a sub-schema used
    // twice in a union, which causes zodToJsonSchema to emit $ref
    const schema = {
      type: "object",
      properties: {
        params: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { $ref: "#/$defs/SubParams" },
              {
                type: "array",
                items: { $ref: "#/$defs/SubParams" },
              },
            ],
          },
        },
      },
      $defs: {
        SubParams: {
          type: "object",
          additionalProperties: {
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
          },
        },
      },
    };

    const result = resolveJsonSchemaRefs(schema);

    const anyOf = result.properties.params.additionalProperties.anyOf;
    expect(anyOf).toHaveLength(5);

    // The 4th item (was $ref) should now be inlined
    expect(anyOf[3]).toEqual({
      type: "object",
      additionalProperties: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
      },
    });

    // The 5th item's array items (was $ref) should also be inlined
    expect(anyOf[4].items).toEqual({
      type: "object",
      additionalProperties: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
      },
    });

    expect(result.$defs).toBeUndefined();
  });

  it("should strip $defs from output", () => {
    const schema = {
      type: "object",
      properties: {
        value: { $ref: "#/$defs/Value" },
      },
      $defs: {
        Value: { type: "string" },
      },
    };

    const result = resolveJsonSchemaRefs(schema);
    expect(result.$defs).toBeUndefined();
    expect(result.definitions).toBeUndefined();
  });

  it("should handle null and primitive values", () => {
    const schema = {
      type: "object",
      properties: {
        nullable: { type: "string", default: null },
        count: { type: "integer", minimum: 0 },
      },
    };

    expect(resolveJsonSchemaRefs(schema)).toEqual(schema);
  });

  it("should pass through unknown $ref targets unchanged", () => {
    const schema = {
      type: "object",
      properties: {
        ext: { $ref: "#/external/Unknown" },
      },
    };

    const result = resolveJsonSchemaRefs(schema);
    expect(result.properties.ext).toEqual({ $ref: "#/external/Unknown" });
  });

  it("should use default maxDepth of 3", () => {
    const schema = {
      $ref: "#/$defs/R",
      $defs: {
        R: {
          type: "object",
          properties: {
            next: { $ref: "#/$defs/R" },
          },
        },
      },
    };

    const result = resolveJsonSchemaRefs(schema);

    // Depth 0 -> 1 -> 2 -> 3 (max, becomes permissive)
    let node = result;
    for (let i = 0; i < 3; i++) {
      expect(node.type).toBe("object");
      node = node.properties.next;
    }
    expect(node).toEqual({ type: "object", additionalProperties: true });
  });
});
