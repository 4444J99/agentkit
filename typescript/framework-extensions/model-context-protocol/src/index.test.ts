import { z } from "zod";
import { getMcpTools } from "./index";
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

describe("getMcpTools", () => {
  it("should return an array of tools and a tool handler with correct properties", async () => {
    const mockAgentKit = await AgentKit.from({});
    const { tools, toolHandler } = await getMcpTools(mockAgentKit);

    expect(tools).toHaveLength(1);
    const tool = tools[0];

    expect(tool.name).toBe(mockAction.name);
    expect(tool.description).toBe(mockAction.description);
    expect(tool.inputSchema).toStrictEqual(
      resolveJsonSchemaRefs(z.toJSONSchema(mockAction.schema) as Record<string, unknown>),
    );

    const result = await toolHandler("testAction", { test: "data" });
    expect(result).toStrictEqual({ content: [{ text: '"Invoked with data"', type: "text" }] });
  });

  it("should produce ref-free inputSchema for schemas with shared sub-schemas", async () => {
    // Reproduces the pattern from issue #815: sub-schema reused in a union
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
    const { tools } = await getMcpTools(mockAgentKit);

    const inputSchema = tools[0].inputSchema;
    const schemaStr = JSON.stringify(inputSchema);
    expect(schemaStr).not.toContain("$ref");
    expect(schemaStr).not.toContain("$defs");
    expect(schemaStr).not.toContain("definitions");
  });
});
