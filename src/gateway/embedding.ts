// The embedding role in the Node lane (ADR-009 second branch, ARCHITECTURE 6): Xenova/multilingual-e5-small, the
// quantized ONNX file, loaded from models/ through @huggingface/transformers with remote models disabled. At the
// first call the three pinned files are verified against bundle/embedding_pin.json by SHA-256 and byte count (fail
// closed), then the tokenizer and the model are created once per process. Each text is embedded alone (no padding,
// one thread, as the Python lane does), mean-pooled over the attention mask, L2-normalised, rounded to six
// decimals; a text over 512 tokens is an error, never truncated. The model configuration is the published
// config.json of the pinned repository, held here so the loader needs only the three pinned files on disk.
import { statSync } from "node:fs";
import { AutoModel, AutoTokenizer, PretrainedConfig, Tensor, env, mean_pooling } from "@huggingface/transformers";
import { z } from "zod";
import { EmbeddingOutput } from "@/contracts/generated/gateway";
import { EMBEDDING_DIM } from "@/db/embedding";
import { EMBEDDING_MAX_TOKENS, EMBEDDING_MODEL, MODELS_DIR } from "./config";
import { fileSha256, modelFilePath, readPin, type EmbeddingPin } from "./pin";

export const DECIMALS = 6;

// https://huggingface.co/Xenova/multilingual-e5-small/blob/main/config.json (read 2026-09-05); BertModel, 384 wide.
const MODEL_CONFIG = {
  _name_or_path: "intfloat/multilingual-e5-small",
  architectures: ["BertModel"],
  attention_probs_dropout_prob: 0.1,
  classifier_dropout: null,
  hidden_act: "gelu",
  hidden_dropout_prob: 0.1,
  hidden_size: 384,
  initializer_range: 0.02,
  intermediate_size: 1536,
  layer_norm_eps: 1e-12,
  max_position_embeddings: 512,
  model_type: "bert",
  num_attention_heads: 12,
  num_hidden_layers: 12,
  pad_token_id: 0,
  position_embedding_type: "absolute",
  tokenizer_class: "XLMRobertaTokenizer",
  type_vocab_size: 2,
  use_cache: true,
  vocab_size: 250037,
};

type Loaded = {
  pin: EmbeddingPin;
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
};

const Vector = z.array(z.number()).length(EMBEDDING_DIM);

export async function verifyPinnedFiles(pin: EmbeddingPin = readPin()): Promise<void> {
  for (const want of pin.files) {
    const file = modelFilePath(want.path);
    let bytes: number;
    try {
      bytes = statSync(file).size;
    } catch {
      throw new Error(`embedding model file missing: ${file}; run pnpm models:fetch (ADR-009)`);
    }
    if (bytes !== want.bytes) {
      throw new Error(`embedding pin mismatch on ${want.path}: ${bytes} bytes on disk, pin ${want.bytes}`);
    }
    const got = await fileSha256(file);
    if (got !== want.sha256) {
      throw new Error(`embedding pin mismatch on ${want.path}: file ${got.slice(0, 12)}, pin ${want.sha256.slice(0, 12)}`);
    }
  }
}

let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  loading ??= (async () => {
    const pin = readPin();
    await verifyPinnedFiles(pin);
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = MODELS_DIR;
    env.useFSCache = false;
    const options = { local_files_only: true } as const;
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(EMBEDDING_MODEL, options),
      AutoModel.from_pretrained(EMBEDDING_MODEL, {
        ...options,
        config: new PretrainedConfig(MODEL_CONFIG),
        dtype: "q8", // loads onnx/model_quantized.onnx, the pinned file
        session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
      }),
    ]);
    return { pin, tokenizer, model };
  })();
  return loading;
}

function lastHiddenState(output: unknown): Tensor {
  if (output !== null && typeof output === "object" && "last_hidden_state" in output) {
    const hidden = (output as { last_hidden_state: unknown }).last_hidden_state;
    if (hidden instanceof Tensor) return hidden;
  }
  throw new Error("embedding: the model returned no last_hidden_state");
}

async function embedOne(loaded: Loaded, text: string): Promise<number[]> {
  const encoded = loaded.tokenizer(text, { padding: false, truncation: false });
  const tokens = encoded.input_ids.dims[1] ?? 0;
  if (tokens > EMBEDDING_MAX_TOKENS) {
    throw new Error(`embedding: ${tokens} tokens exceed ${EMBEDDING_MAX_TOKENS} (AC-ING-13; never truncated)`);
  }
  const output: unknown = await loaded.model(encoded);
  const pooled = mean_pooling(lastHiddenState(output), encoded.attention_mask).normalize(2, -1);
  const rows: unknown = pooled.tolist();
  const vector = Vector.parse(Array.isArray(rows) ? rows[0] : rows);
  return vector.map((x) => Number(x.toFixed(DECIMALS)));
}

export async function embed(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
  const loaded = await load();
  const prefix = kind === "query" ? loaded.pin.query_prefix : loaded.pin.passage_prefix;
  const vectors: number[][] = [];
  for (const text of texts) vectors.push(await embedOne(loaded, prefix + text));
  return EmbeddingOutput.parse({ vectors }).vectors;
}
