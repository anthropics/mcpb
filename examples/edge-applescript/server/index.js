#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Constants
const APPLESCRIPT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

class EdgeControlServer {
  constructor() {
    this.server = new Server(
      {
        name: "edge-applescript",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  // Helper methods
  escapeForAppleScript(str) {
    if (typeof str !== "string") return str;
    // Basic AppleScript string escaping
    return str
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Then escape double quotes
      .replace(/\n/g, "\\n") // Escape newlines
      .replace(/\r/g, "\\r"); // Escape carriage returns
  }

  async checkEdgeAvailable() {
    try {
      const script = 'tell application "Microsoft Edge" to return "available"';
      const result = await this.executeAppleScript(script);
      return result === "available";
    } catch (error) {
      return false;
    }
  }

  async executeAppleScript(script, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { stdout, stderr } = await execFileAsync(
          "osascript",
          ["-e", script],
          {
            timeout: APPLESCRIPT_TIMEOUT,
            maxBuffer: 1024 * 1024, // 1MB buffer
          },
        );
        if (stderr) {
          console.error("AppleScript stderr:", stderr);
        }
        return stdout.trim();
      } catch (error) {
        if (attempt === retries) {
          console.error("AppleScript execution error after retries:", error);
          throw new Error(`AppleScript error: ${error.message}`);
        }
        // Retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)),
        );
      }
    }
  }

  async findTabById(tabId) {
    const script = `
      tell application "Microsoft Edge"
        repeat with w in windows
          repeat with t in tabs of w
            if (id of t as string) is "${tabId}" then
              return {w, t, true}
            end if
          end repeat
        end repeat
        return {null, null, false}
      end tell
    `;
    return this.executeAppleScript(script);
  }

  async executeTabOperation(
    tabId,
    operation,
    successMessage = "Operation completed",
  ) {
    if (!tabId) {
      // No tab ID, execute on active tab
      return this.executeAppleScript(operation.activeScript);
    }

    const script = `
      tell application "Microsoft Edge"
        repeat with w in windows
          repeat with t in tabs of w
            if (id of t as string) is "${tabId}" then
              ${operation.tabScript}
              return "${successMessage}"
            end if
          end repeat
        end repeat
        return "Tab not found"
      end tell
    `;
    return this.executeAppleScript(script);
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "open_url",
          description: "Open a URL in Edge",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL to open" },
              new_tab: {
                type: "boolean",
                description: "Open in a new tab",
                default: true,
              },
            },
            required: ["url"],
          },
        },
        {
          name: "get_current_tab",
          description: "Get information about the current active tab",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_tabs",
          description: "List all open tabs in Edge",
          inputSchema: {
            type: "object",
            properties: {
              window_id: {
                type: "number",
                description: "Specific window ID to list tabs from",
              },
            },
          },
        },
        {
          name: "close_tab",
          description: "Close a specific tab",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: { type: "number", description: "ID of the tab to close" },
            },
            required: ["tab_id"],
          },
        },
        {
          name: "switch_to_tab",
          description: "Switch to a specific tab",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: {
                type: "number",
                description: "ID of the tab to switch to",
              },
            },
            required: ["tab_id"],
          },
        },
        {
          name: "reload_tab",
          description: "Reload a tab",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: {
                type: "number",
                description: "ID of the tab to reload",
              },
            },
          },
        },
        {
          name: "go_back",
          description: "Navigate back in browser history",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: { type: "number", description: "ID of the tab" },
            },
          },
        },
        {
          name: "go_forward",
          description: "Navigate forward in browser history",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: { type: "number", description: "ID of the tab" },
            },
          },
        },
        {
          name: "execute_javascript",
          description: "Execute JavaScript in the current tab",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "JavaScript code to execute",
              },
              tab_id: { type: "number", description: "ID of the tab" },
            },
            required: ["code"],
          },
        },
        {
          name: "get_page_content",
          description: "Get the text content of the current page",
          inputSchema: {
            type: "object",
            properties: {
              tab_id: { type: "number", description: "ID of the tab" },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check Edge availability first
        const isEdgeAvailable = await this.checkEdgeAvailable();
        if (!isEdgeAvailable) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Microsoft Edge is not available or not running",
              },
            ],
            isError: true,
          };
        }

        switch (name) {
          case "open_url": {
            const { url, new_tab = true } = args;
            if (!url || typeof url !== "string") {
              throw new Error("URL is required and must be a string");
            }

            const escapedUrl = this.escapeForAppleScript(url);
            const script = new_tab
              ? `tell application "Microsoft Edge" to open location "${escapedUrl}"`
              : `tell application "Microsoft Edge" to set URL of active tab of front window to "${escapedUrl}"`;

            await this.executeAppleScript(script);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      action: new_tab
                        ? "opened_new_tab"
                        : "navigated_current_tab",
                      url: url,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "get_current_tab": {
            const script = `
              tell application "Microsoft Edge"
                set currentTab to active tab of front window
                set tabInfo to {URL of currentTab, title of currentTab, id of currentTab}
                return tabInfo
              end tell
            `;
            const result = await this.executeAppleScript(script);
            const [url, title, id] = result.split(", ");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      url,
                      title,
                      id: parseInt(id),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "list_tabs": {
            const script = `
              tell application "Microsoft Edge"
                set tabsList to {}
                repeat with w in windows
                  repeat with t in tabs of w
                    set end of tabsList to {id of t as string, URL of t, title of t}
                  end repeat
                end repeat
                set AppleScript's text item delimiters to "|"
                set output to ""
                repeat with tabInfo in tabsList
                  set output to output & (item 1 of tabInfo) & "," & (item 2 of tabInfo) & "," & (item 3 of tabInfo) & "|"
                end repeat
                return output
              end tell
            `;
            const result = await this.executeAppleScript(script);
            const tabs = result
              .split("|")
              .filter((tab) => tab)
              .map((tab) => {
                const [id, url, title] = tab.split(",");
                return { id: parseInt(id), url, title };
              });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      tabs: tabs,
                      count: tabs.length,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "close_tab": {
            const { tab_id } = args;

            const result = await this.executeTabOperation(
              tab_id,
              {
                tabScript: "close t",
                activeScript: `
                  tell application "Microsoft Edge"
                    close active tab of front window
                    return "Tab closed"
                  end tell
                `,
              },
              "Tab closed",
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result === "Tab closed",
                      message: result,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "switch_to_tab": {
            const { tab_id } = args;

            if (!tab_id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "tab_id is required",
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            // Use a direct AppleScript approach instead of executeTabOperation
            const script = `
              tell application "Microsoft Edge"
                set tabFound to false
                repeat with w in windows
                  set tabIndex to 0
                  repeat with t in tabs of w
                    set tabIndex to tabIndex + 1
                    if (id of t as string) is "${tab_id}" then
                      set active tab index of w to tabIndex
                      set index of w to 1
                      activate
                      set tabFound to true
                      exit repeat
                    end if
                  end repeat
                  if tabFound then exit repeat
                end repeat
                if tabFound then
                  return "Switched to tab"
                else
                  return "Tab not found"
                end if
              end tell
            `;

            const result = await this.executeAppleScript(script);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result === "Switched to tab",
                      message: result,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "reload_tab": {
            const { tab_id } = args;

            const result = await this.executeTabOperation(
              tab_id,
              {
                tabScript: "reload t",
                activeScript: `
                  tell application "Microsoft Edge"
                    reload active tab of front window
                    return "Tab reloaded"
                  end tell
                `,
              },
              "Tab reloaded",
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result !== "Tab not found",
                      message: result,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "go_back": {
            const { tab_id } = args;

            const result = await this.executeTabOperation(
              tab_id,
              {
                tabScript: "go back t",
                activeScript: `
                  tell application "Microsoft Edge"
                    go back active tab of front window
                    return "Navigated back"
                  end tell
                `,
              },
              "Navigated back",
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result !== "Tab not found",
                      message: result,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "go_forward": {
            const { tab_id } = args;

            const result = await this.executeTabOperation(
              tab_id,
              {
                tabScript: "go forward t",
                activeScript: `
                  tell application "Microsoft Edge"
                    go forward active tab of front window
                    return "Navigated forward"
                  end tell
                `,
              },
              "Navigated forward",
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result !== "Tab not found",
                      message: result,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "execute_javascript": {
            const { code, tab_id } = args;
            if (!code || typeof code !== "string") {
              throw new Error(
                "JavaScript code is required and must be a string",
              );
            }

            // Edge's AppleScript may have different behavior with return values
            // Let's use a more direct approach without wrapper functions
            // and ensure the code explicitly returns a value
            const wrappedCode = `
              (() => {
                try {
                  let __result = ${code.includes('return') ? code : `(() => { ${code} })()`};
                  if (__result === undefined) return 'undefined';
                  if (__result === null) return 'null';
                  if (typeof __result === 'object') {
                    try { return JSON.stringify(__result); }
                    catch(e) { return String(__result); }
                  }
                  return String(__result);
                } catch(e) {
                  return 'Error: ' + e.toString();
                }
              })()
            `;

            const escapedCode = this.escapeForAppleScript(wrappedCode);

            // Use a different AppleScript structure that explicitly captures the result
            const script = tab_id
              ? `
              tell application "Microsoft Edge"
                repeat with w in windows
                  repeat with t in tabs of w
                    if (id of t as string) is "${tab_id}" then
                      set jsResult to execute t javascript "${escapedCode}"
                      if jsResult is missing value then
                        return "undefined"
                      else
                        return jsResult as string
                      end if
                    end if
                  end repeat
                end repeat
                return "Tab not found"
              end tell
            `
              : `
              tell application "Microsoft Edge"
                set jsResult to execute active tab of front window javascript "${escapedCode}"
                if jsResult is missing value then
                  return "undefined"
                else
                  return jsResult as string
                end if
              end tell
            `;

            const result = await this.executeAppleScript(script);

            // Check if it's an error or tab not found
            if (result === "Tab not found") {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "Tab not found",
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            // Check if the result starts with "Error: "
            const isError = result.startsWith("Error: ");
            
            // Try to parse as JSON if it looks like JSON
            let parsedResult = result;
            if (!isError && (result.startsWith("{") || result.startsWith("["))) {
              try {
                parsedResult = JSON.parse(result);
              } catch (e) {
                // Keep as string if parsing fails
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: !isError,
                      result: isError ? undefined : parsedResult,
                      error: isError ? result.substring(7) : undefined,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "get_page_content": {
            const { tab_id } = args;

            const jsCode = "document.body.innerText";
            const script = tab_id
              ? `
              tell application "Microsoft Edge"
                repeat with w in windows
                  repeat with t in tabs of w
                    if (id of t as string) is "${tab_id}" then
                      set pageContent to execute t javascript "${jsCode}"
                      return pageContent
                    end if
                  end repeat
                end repeat
                return "Tab not found"
              end tell
            `
              : `
              tell application "Microsoft Edge"
                execute active tab of front window javascript "${jsCode}"
              end tell
            `;

            const result = await this.executeAppleScript(script);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: result !== "Tab not found",
                      content: result,
                      contentLength: result.length,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error in tool '${name}':`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: error.message,
                  tool: name,
                  args: args,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    try {
      const isEdgeAvailable = await this.checkEdgeAvailable();
      if (!isEdgeAvailable) {
        console.error("Warning: Microsoft Edge is not available or not running");
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Edge AppleScript MCP server running on stdio");
    } catch (error) {
      console.error("Failed to start Edge AppleScript MCP server:", error);
      throw error;
    }
  }
}

const server = new EdgeControlServer();
server.run().catch(console.error);