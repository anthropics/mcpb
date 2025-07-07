import type {
  DxtManifest,
  DxtUserConfigValues,
  Logger,
  McpServerConfig,
} from "../types.js";

/**
 * This file contains utility functions for handling DXT configuration,
 * including variable replacement and MCP server configuration generation.
 */

/**
 * Recursively replaces variables in any value. Handles strings, arrays, and objects.
 *
 * @param value The value to process
 * @param variables Object containing variable replacements
 * @returns The processed value with all variables replaced
 */
export function replaceVariables(
  value: unknown,
  variables: Record<string, string | string[]>,
): unknown {
  if (typeof value === "string") {
    let result = value;

    // Replace all variables in the string
    for (const [key, replacement] of Object.entries(variables)) {
      const pattern = new RegExp(`\\$\\{${key}\\}`, "g");

      // Check if this pattern actually exists in the string
      if (result.match(pattern)) {
        if (Array.isArray(replacement)) {
          console.warn(
            `Cannot replace ${key} with array value in string context: "${value}"`,
            { key, replacement },
          );
        } else {
          result = result.replace(pattern, replacement);
        }
      }
    }

    return result;
  } else if (Array.isArray(value)) {
    // For arrays, we need to handle special case of array expansion
    const result: unknown[] = [];

    for (const item of value) {
      if (
        typeof item === "string" &&
        item.match(/^\$\{user_config\.[^}]+\}$/)
      ) {
        // This is a user config variable that might expand to multiple values
        const varName = item.match(/^\$\{([^}]+)\}$/)?.[1];
        if (varName && variables[varName]) {
          const replacement = variables[varName];
          if (Array.isArray(replacement)) {
            // Expand array inline
            result.push(...replacement);
          } else {
            result.push(replacement);
          }
        } else {
          // Variable not found, keep original
          result.push(item);
        }
      } else {
        // Recursively process non-variable items
        result.push(replaceVariables(item, variables));
      }
    }

    return result;
  } else if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = replaceVariables(val, variables);
    }

    return result;
  }

  return value;
}

interface GetMcpConfigForManifestOptions {
  manifest: DxtManifest;
  extensionPath: string;
  systemDirs: Record<string, string>;
  userConfig: DxtUserConfigValues;
  pathSeparator: string;
  logger?: Logger;
}

export async function getMcpConfigForManifest(
  options: GetMcpConfigForManifestOptions,
): Promise<McpServerConfig | undefined> {
  const {
    manifest,
    extensionPath,
    systemDirs,
    userConfig,
    pathSeparator,
    logger,
  } = options;
  const baseConfig = manifest.server?.mcp_config;
  if (!baseConfig) {
    return undefined;
  }

  let result: McpServerConfig = {
    ...baseConfig,
  };

  if (baseConfig.platform_overrides) {
    if (process.platform in baseConfig.platform_overrides) {
      const platformConfig = baseConfig.platform_overrides[process.platform];

      result.command = platformConfig.command || result.command;
      result.args = platformConfig.args || result.args;
      result.env = platformConfig.env || result.env;
    }
  }

  // Check if required configuration is missing
  if (hasRequiredConfigMissing({ manifest, userConfig })) {
    logger?.warn(
      `Extension ${manifest.name} has missing required configuration, skipping MCP config`,
    );
    return undefined;
  }

  const variables: Record<string, string | string[]> = {
    __dirname: extensionPath,
    pathSeparator,
    "/": pathSeparator,
    ...systemDirs,
  };

  // Build merged configuration from defaults and user settings
  const mergedConfig: Record<string, unknown> = {};

  // First, add defaults from manifest
  if (manifest.user_config) {
    for (const [key, configOption] of Object.entries(manifest.user_config)) {
      if (configOption.default !== undefined) {
        mergedConfig[key] = configOption.default;
      }
    }
  }

  // Then, override with user settings
  if (userConfig) {
    Object.assign(mergedConfig, userConfig);
  }

  // Add merged configuration variables for substitution
  for (const [key, value] of Object.entries(mergedConfig)) {
    // Convert user config to the format expected by variable substitution
    const userConfigKey = `user_config.${key}`;

    if (Array.isArray(value)) {
      // Keep arrays as arrays for proper expansion
      variables[userConfigKey] = value.map(String);
    } else if (typeof value === "boolean") {
      // Convert booleans to "true"/"false" strings as per spec
      variables[userConfigKey] = value ? "true" : "false";
    } else {
      // Convert other types to strings
      variables[userConfigKey] = String(value);
    }
  }

  // Replace all variables in the config
  result = replaceVariables(result, variables) as McpServerConfig;

  return result;
}

interface HasRequiredConfigMissingOptions {
  manifest: DxtManifest;
  userConfig?: DxtUserConfigValues;
}

/**
 * Check if an extension has missing required configuration
 * @param manifest The extension manifest
 * @param userConfig The user configuration
 * @returns true if required configuration is missing
 */
export function hasRequiredConfigMissing({
  manifest,
  userConfig,
}: HasRequiredConfigMissingOptions): boolean {
  if (!manifest.user_config) {
    return false;
  }

  const config = userConfig || {};

  for (const [key, configOption] of Object.entries(manifest.user_config)) {
    if (configOption.required) {
      const value = config[key];
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return true;
      }
    }
  }

  return false;
}
