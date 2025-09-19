import Ajv, { ErrorObject, JSONSchemaType } from "ajv";
import { DesignTokens, ProjectSpec } from "../types";
import projectSpecSchema from "./project_spec.schema.json" assert { type: "json" };
import designTokensSchema from "./ds.tokens.schema.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const projectSpecValidator = ajv.compile<ProjectSpec>(
  projectSpecSchema as JSONSchemaType<ProjectSpec>,
);
const designTokensValidator = ajv.compile<DesignTokens>(
  designTokensSchema as JSONSchemaType<DesignTokens>,
);

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return "Unknown validation error";
  }
  return errors
    .map((error) => {
      const path = error.instancePath || "(root)";
      const message = error.message ?? "invalid value";
      return `${path} ${message}`.trim();
    })
    .join("; ");
}

export function assertValidProjectSpec(spec: ProjectSpec): ProjectSpec {
  if (!projectSpecValidator(spec)) {
    throw new Error(`ProjectSpec inválido: ${formatErrors(projectSpecValidator.errors)}`);
  }
  return spec;
}

export function assertValidDesignTokens(tokens: DesignTokens): DesignTokens {
  if (!designTokensValidator(tokens)) {
    throw new Error(`DesignTokens inválidos: ${formatErrors(designTokensValidator.errors)}`);
  }
  return tokens;
}
