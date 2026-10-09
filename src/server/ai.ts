import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "@/lib/env";

export interface AiResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}

export interface AiClient {
  model: string;
  generateJson<S extends z.ZodType>(args: { schema: S; system: string; prompt: string; maxTokens?: number }): Promise<AiResult<z.infer<S>>>;
}

/** Cliente Claude (Anthropic) com saída estruturada validada por Zod. */
export class AnthropicAiClient implements AiClient {
  private client: Anthropic;
  constructor(
    apiKey: string,
    public model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }

  async generateJson<S extends z.ZodType>({ schema, system, prompt, maxTokens = 4000 }: { schema: S; system: string; prompt: string; maxTokens?: number }) {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === "refusal") throw new Error("A IA recusou a solicitação.");
    if (response.stop_reason === "max_tokens") throw new Error("Resposta da IA truncada (max_tokens).");
    if (!response.parsed_output) throw new Error("A IA não retornou JSON válido.");
    return {
      data: response.parsed_output as z.infer<S>,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

export function getAiClient(): AiClient | null {
  const key = env.anthropicKey;
  return key ? new AnthropicAiClient(key, env.anthropicModel) : null;
}
