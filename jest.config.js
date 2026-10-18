module.exports = {
  testPathIgnorePatterns: [
    "/node_modules/",
    "\\.integration\\.spec\\.ts$",
    "/tests/e2e/",
  ],
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  collectCoverageFrom: ["apps/**/*.ts", "libs/**/*.ts"],
  coverageDirectory: "coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@shopfast/platform/(.*)$": "<rootDir>/libs/platform/src/$1",
  },
};
