module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.ts"],
  collectCoverageFrom: ["packages/**/src/**/*.ts", "!**/*.d.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@modelcontextprotocol/mcpb-schemas$":
      "<rootDir>/packages/schemas/src/index.ts",
    "^@modelcontextprotocol/mcpb-cli$": "<rootDir>/packages/cli/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
