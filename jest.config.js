module.exports = {
  modulePathIgnorePatterns: [
    "<rootDir>/.secrets/",
    "<rootDir>/tools/references/",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "\\.integration\\.spec\\.ts$",
    "/tests/e2e/",
  ],
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  collectCoverageFrom: [
    "BE/api/**/*.ts",
    "BE/worker/**/*.ts",
    "BE/modules/**/*.ts",
    "BE/platform/**/*.ts",
  ],
  coverageDirectory: "coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@shopfast/platform/(.*)$": "<rootDir>/BE/platform/src/$1",
  },
};
