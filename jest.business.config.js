module.exports = {
  ...require("./jest.config"),
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  testTimeout: 30000,
  collectCoverage: true,
  collectCoverageFrom: ["libs/modules/**/*.ts"],
  coverageDirectory: "coverage/business",
  coverageReporters: ["json-summary", "text-summary", "lcov"],
  coverageThreshold: { global: { lines: 60 } },
};
