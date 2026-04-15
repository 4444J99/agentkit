import { z } from "zod";
import { getLangChainTools } from "./index";
import { AgentKit, resolveJsonSchemaRefs } from "@coinbase/agentkit";

// Mock AgentKit before importing - this prevents loading ES-only dependencies
jest.mock("@coinbase/agentkit", () => {
  const actual = jest.requireActual("@coinbase/agentkit");
  return {
    AgentKit: {
      from: jest.fn(),
    },
    resolveJsonSchemaRefs: actual.resolveJsonSchemaRefs,
  };
});

// Define mock action after imports
const mockAction = {
  name: "testAction",
  description: "A test action",
  schema: z.object({ test: z.string() }),
  invoke: jest.fn(async (arg: { test: string }) => `Invoked with ${arg.test}`),
};

// Configure the mock
(AgentKit.from as jest.Mock).mockImplementation(() => ({
  getActions: jest.fn(() => [mockAction]),
}));

describe("getLangChainTools", () => {
  it("should return an array of tools with correct properties", async () => {
    const mockAgentKit = await AgentKit.from({});
    const tools = await getLangChainTools(mockAgentKit);

    expect(tools).toHaveLength(1);
    const tool = tools[0];

    expect(tool.name).toBe(mockAction.name);
    expect(tool.description).toBe(mockAction.description);

    // Schema is now a pre-resolved JSON schema (not raw Zod)
    const expectedSchema = resolveJsonSchemaRefs(
      z.toJSONSchema(mockAction.schema) as Record<string, unknown>,
    );
    expect(tool.schema).toStrictEqual(expectedSchema);

    const result = await tool.invoke({ test: "data" });
    expect(result).toBe("Invoked with data");
  });

  it("should produce ref-free schema for actions with shared sub-schemas", async () => {
    const subSchema = z.object({
      key: z.string(),
      value: z.string(),
    });

    const actionWithRefs = {
      name: "refAction",
      description: "An action with shared sub-schemas",
      schema: z.object({
        direct: subSchema,
        wrapped: z.array(subSchema),
      }),
      invoke: jest.fn(async () => "ok"),
    };

    (AgentKit.from as jest.Mock).mockImplementation(() => ({
      getActions: jest.fn(() => [actionWithRefs]),
    }));

    const mockAgentKit = await AgentKit.from({});
    const tools = await getLangChainTools(mockAgentKit);

    const schemaStr = JSON.stringify(tools[0].schema);
    expect(schemaStr).not.toContain("$ref");
    expect(schemaStr).not.toContain("$defs");
    expect(schemaStr).not.toContain("definitions");
  });
});
