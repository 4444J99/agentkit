/**
 * Main exports for the CDP Langchain package
 */

import { z } from "zod";
import { StructuredTool, tool } from "@langchain/core/tools";
import { AgentKit, Action, resolveJsonSchemaRefs } from "@coinbase/agentkit";

/**
 * Converts a Zod schema to a flat JSON Schema with all `$ref` pointers resolved.
 * This prevents `BadRequestError: 400 Invalid schema` when LLM providers
 * (e.g. OpenAI) reject schemas containing `$ref` pointers.
 *
 * @param zodSchema - A Zod schema
 * @returns A JSON Schema object with no `$ref` pointers
 */
function toFlatJsonSchema(zodSchema: z.ZodSchema): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(zodSchema);
  return resolveJsonSchemaRefs(jsonSchema as Record<string, unknown>);
}

/**
 * Get Langchain tools from an AgentKit instance
 *
 * @param agentKit - The AgentKit instance
 * @returns An array of Langchain tools compatible with langchain's createAgent
 */
export async function getLangChainTools(
  agentKit: AgentKit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<(StructuredTool & Record<string, any>)[]> {
  const actions: Action[] = agentKit.getActions();
  return actions.map(action =>
    tool(
      async (arg: z.output<typeof action.schema>) => {
        const result = await action.invoke(arg);
        return result;
      },
      {
        name: action.name,
        description: action.description,
        schema: toFlatJsonSchema(action.schema),
      },
    ),
  );
}
