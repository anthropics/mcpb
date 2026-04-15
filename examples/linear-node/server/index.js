#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LinearClient } from "@linear/sdk";

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  console.error("LINEAR_API_KEY environment variable is required");
  process.exit(1);
}

const linear = new LinearClient({ apiKey });

const server = new Server(
  {
    name: "linear",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// --- Tool definitions ---

const TOOLS = [
  {
    name: "create_issue",
    description: "Create a new issue in Linear",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Issue title" },
        teamId: { type: "string", description: "Team ID to create the issue in" },
        description: { type: "string", description: "Issue description (markdown supported)" },
        priority: { type: "number", description: "Priority level (0=none, 1=urgent, 2=high, 3=medium, 4=low)", minimum: 0, maximum: 4 },
        status: { type: "string", description: "Initial status name" },
      },
      required: ["title", "teamId"],
    },
  },
  {
    name: "update_issue",
    description: "Update an existing Linear issue",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        priority: { type: "number", description: "New priority (0-4)", minimum: 0, maximum: 4 },
        status: { type: "string", description: "New status name" },
        assigneeId: { type: "string", description: "New assignee user ID" },
      },
      required: ["issueId"],
    },
  },
  {
    name: "search_issues",
    description: "Search for issues with flexible filtering",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search in title and description" },
        teamId: { type: "string", description: "Filter by team ID" },
        status: { type: "string", description: "Filter by status name" },
        assigneeId: { type: "string", description: "Filter by assignee user ID" },
        priority: { type: "number", description: "Filter by priority (0-4)" },
        limit: { type: "number", description: "Max results (default: 10)", default: 10 },
      },
    },
  },
  {
    name: "get_issue",
    description: "Get details of a specific issue by its identifier (e.g. ENG-123)",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue identifier (e.g. ENG-123)" },
      },
      required: ["issueId"],
    },
  },
  {
    name: "list_teams",
    description: "List all teams in the workspace",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_projects",
    description: "List projects with optional team filtering",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "Filter by team ID" },
        limit: { type: "number", description: "Max results (default: 50)", default: 50 },
      },
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to an issue",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue ID to comment on" },
        body: { type: "string", description: "Comment text (markdown supported)" },
      },
      required: ["issueId", "body"],
    },
  },
];

// --- Tool handlers ---

async function handleCreateIssue(args) {
  const { title, teamId, description, priority, status } = args;

  const input = { title, teamId };
  if (description) input.description = description;
  if (priority !== undefined) input.priority = priority;

  if (status) {
    const team = await linear.team(teamId);
    const states = await team.states();
    const state = states.nodes.find(
      (s) => s.name.toLowerCase() === status.toLowerCase(),
    );
    if (state) input.stateId = state.id;
  }

  const result = await linear.createIssue(input);
  const issue = await result.issue;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleUpdateIssue(args) {
  const { issueId, title, description, priority, status, assigneeId } = args;

  const input = {};
  if (title) input.title = title;
  if (description) input.description = description;
  if (priority !== undefined) input.priority = priority;
  if (assigneeId) input.assigneeId = assigneeId;

  if (status) {
    const issue = await linear.issue(issueId);
    const team = await issue.team;
    const states = await team.states();
    const state = states.nodes.find(
      (s) => s.name.toLowerCase() === status.toLowerCase(),
    );
    if (state) input.stateId = state.id;
  }

  await linear.updateIssue(issueId, input);
  const updated = await linear.issue(issueId);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: updated.id,
            identifier: updated.identifier,
            title: updated.title,
            url: updated.url,
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleSearchIssues(args) {
  const { query, teamId, status, assigneeId, priority, limit = 10 } = args;

  const filter = {};
  if (teamId) filter.team = { id: { eq: teamId } };
  if (assigneeId) filter.assignee = { id: { eq: assigneeId } };
  if (priority !== undefined) filter.priority = { eq: priority };
  if (status) filter.state = { name: { eqIgnoreCase: status } };

  let issues;
  if (query) {
    issues = await linear.searchIssues(query, { first: limit });
  } else {
    issues = await linear.issues({ filter, first: limit });
  }

  const results = issues.nodes.map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    priority: issue.priority,
    url: issue.url,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function handleGetIssue(args) {
  const { issueId } = args;

  const issue = await linear.issue(issueId);
  const state = await issue.state;
  const assignee = await issue.assignee;
  const team = await issue.team;
  const labels = await issue.labels();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            priority: issue.priority,
            status: state?.name,
            assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
            team: { id: team.id, name: team.name },
            labels: labels.nodes.map((l) => l.name),
            url: issue.url,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleListTeams() {
  const teams = await linear.teams();

  const results = teams.nodes.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    description: team.description,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function handleListProjects(args) {
  const { teamId, limit = 50 } = args;

  const filter = {};
  if (teamId) {
    filter.accessibleTeams = { some: { id: { eq: teamId } } };
  }

  const projects = await linear.projects({ filter, first: limit });

  const results = projects.nodes.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    state: project.state,
    url: project.url,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function handleAddComment(args) {
  const { issueId, body } = args;

  const result = await linear.createComment({ issueId, body });
  const comment = await result.comment;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: comment.id,
            body: comment.body,
            url: comment.url,
            createdAt: comment.createdAt,
          },
          null,
          2,
        ),
      },
    ],
  };
}

// --- Request handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_issue":
        return await handleCreateIssue(args);
      case "update_issue":
        return await handleUpdateIssue(args);
      case "search_issues":
        return await handleSearchIssues(args);
      case "get_issue":
        return await handleGetIssue(args);
      case "list_teams":
        return await handleListTeams();
      case "list_projects":
        return await handleListProjects(args);
      case "add_comment":
        return await handleAddComment(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);

console.error("Linear MCP server running...");
